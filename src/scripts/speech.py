"""Read text files aloud with VieNeu-TTS: one .wav per file, and an .srt beside it on request.

Run it through the scripts' virtualenv, which `npm run speech --` does for you:

    npm run speech -- --input chapter-0001.vi.txt --output chapter-0001.wav --gen-srt
    npm run speech -- --input-batch inputs.txt --output-batch outputs.txt --workers 2 --gen-srt

Every non-blank line of an input file is one utterance. A file's lines are synthesized together
in the model's batch mode, then laid back to back into its wav with a short gap between them;
the srt carries one cue per line, timed by that line's own clip. `--input-batch` and
`--output-batch` each list one path per line and are paired by line number, so the two files
must be the same length. Paths are relative to wherever you run it from.

Each worker loads its own copy of the model and reads one file at a time, so `--workers` is
bounded by what the GPU holds, not by how many files there are. A file that fails is logged and
left without output rather than stopping the run.
"""

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

from core.logger import configure_logging, use_worker
from core.schedule import parse_scheduled, wait_until
from speech.engine import Speaker
from speech.srt import write_srt

logger = logging.getLogger("speech")

DEFAULT_VOICE = "Ngọc Huyền"
DEFAULT_BATCH_SIZE = 32


def read_lines(path: Path) -> list[str]:
    """The file's non-blank lines, whitespace trimmed."""
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def collect_jobs(args: argparse.Namespace) -> list[tuple[Path, Path]]:
    """The (input, output) pairs to work, from either the single or the batch flags."""
    if args.input:
        return [(Path(args.input), Path(args.output))]

    inputs = read_lines(Path(args.input_batch))
    outputs = read_lines(Path(args.output_batch))
    if len(inputs) != len(outputs):
        raise ValueError(f"--input-batch lists {len(inputs)} files but --output-batch lists {len(outputs)}; they must pair up line by line.")
    return [(Path(source), Path(target)) for source, target in zip(inputs, outputs)]


def read_file(speaker: Speaker, source: Path, target: Path, voice: str, gen_srt: bool) -> None:
    """Synthesizes one file into its wav (and srt), moving the wav into place only once it is whole."""
    lines = read_lines(source)
    if not lines:
        raise ValueError("the file has no text")

    audio, spans = speaker.read(lines, voice)

    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".tmp")
    speaker.save(audio, partial)
    if gen_srt:
        write_srt(lines, spans, target.with_suffix(".srt"))
    os.replace(partial, target)


async def read_files(jobs: list[tuple[Path, Path]], args: argparse.Namespace) -> int:
    """Works every job across `--workers` model instances; returns how many failed."""
    pending: asyncio.Queue[tuple[Path, Path]] = asyncio.Queue()
    for job in jobs:
        pending.put_nowait(job)

    done = 0
    failed = 0

    async def work(worker_id: int) -> None:
        nonlocal done, failed
        use_worker(worker_id)
        speaker = await asyncio.to_thread(Speaker, args.device, args.batch_size)
        if args.voice not in speaker.voices():
            raise ValueError(f"'{args.voice}' is not a voice the model knows. Pick one of: {', '.join(speaker.voices())}.")

        while True:
            try:
                source, target = pending.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                await asyncio.to_thread(read_file, speaker, source, target, args.voice, args.gen_srt)
            except Exception as error:
                failed += 1
                logger.warning("%s failed: %s", source, error)
            finally:
                done += 1
                logger.info("%s done (%d/%d)", source, done, len(jobs))

    await asyncio.gather(*(work(worker_id) for worker_id in range(1, min(args.workers, len(jobs)) + 1)))
    return failed


async def run(args: argparse.Namespace) -> int:
    jobs = collect_jobs(args)
    missing = [str(source) for source, _ in jobs if not source.is_file()]
    if missing:
        raise ValueError(f"no such input file: {', '.join(missing)}")

    scheduled = parse_scheduled(args.scheduled)
    if scheduled:
        await wait_until(scheduled)

    logger.info("reading %d file(s) with voice %s on %s, %d worker(s)", len(jobs), args.voice, args.device, args.workers)
    failed = await read_files(jobs, args)
    logger.info("%d file(s) read%s", len(jobs) - failed, f", {failed} failed" if failed else "")
    return failed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--input", help="A text file to read, one utterance per line")
    source.add_argument("--input-batch", help="A file listing text files to read, one path per line")
    parser.add_argument("--output", help="The .wav to write for --input")
    parser.add_argument("--output-batch", help="A file listing the .wav to write for each --input-batch line")
    parser.add_argument("--gen-srt", action="store_true", help="Also write an .srt beside every .wav")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"A VieNeu preset voice (default {DEFAULT_VOICE})")
    parser.add_argument("--device", default="auto", help="Where the model runs: auto (default), cuda or cpu")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help=f"Text chunks per forward pass on the GPU (default {DEFAULT_BATCH_SIZE})")
    parser.add_argument("--workers", type=int, default=1, help="How many files to read at once, i.e. model instances loaded (default 1)")
    parser.add_argument("--scheduled", help="Start at this local ISO-8601 time instead of now, e.g. 2026-09-02T01:30")
    args = parser.parse_args(argv)

    if args.input and not args.output:
        parser.error("--input needs --output")
    if args.input_batch and not args.output_batch:
        parser.error("--input-batch needs --output-batch")
    return args


def main(argv: list[str] | None = None) -> int:
    configure_logging()
    args = parse_args(argv)

    try:
        failed = asyncio.run(run(args))
    except ValueError as error:
        logger.error("%s", error)
        return 2

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
