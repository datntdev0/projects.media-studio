import { useState } from 'react';
import { RefreshIcon, SparkleIcon } from '@/components/icons';
import { BASE_LOOK_SLUG, artStyleOf, type ArtStyle, type CharacterDesign, type CharacterOutfitDesign, type IllustrationDesign } from '@/shared/app-workspace-illustration';
import { baseLookImageOf, characterKickerOf, characterRailTagOf, characterSubLabelOf, designMissingCountOf, outfitImageOf, outfitSceneLabelOf } from '../illustrationFormat';
import { PromptCard } from './PromptCard';
import { ImageLightbox, type LightboxSlide } from './ImageLightbox';

interface CharacterDesignPaneProps {
  design: IllustrationDesign;
  style: ArtStyle;
  images: Record<string, string>;
  disabled: boolean;
  /** The `<character>.<outfit>` being drawn right now, or undefined when nothing is. */
  drawing: string | undefined;
  onEdit(design: IllustrationDesign): void;
  onRebuild(): void;
  onGenerate(characterSlug: string, outfitSlug: string): void;
}

const SHEET_WIDTH = 176;
const SHEET_HEIGHT = 220;

/** The original wording above its translation — the same pairing the translation tables use. */
function Wording({ kicker, original, translated }: { kicker: string; original: string; translated: string }) {
  return (
    <div>
      <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>{kicker}</div>
      <div className="text-muted" style={{ fontSize: 12 }}>{original || '—'}</div>
      <div style={{ fontSize: 13 }}>{translated || '—'}</div>
    </div>
  );
}

/** The characters down the side, in the order the story introduces them, each with how much of it is still to draw. */
function CharacterRail({ design, style, images, selected, onPick }: { design: IllustrationDesign; style: ArtStyle; images: Record<string, string>; selected: string; onPick(slug: string): void }) {
  return (
    <div style={{ width: 280, flex: 'none', borderRight: '1px solid var(--color-divider)', overflow: 'auto' }}>
      {design.characters.map((character) => {
        const base = baseLookImageOf(character, style, images);
        const tag = characterRailTagOf(character, style, images);
        return (
          <div
            key={character.slug}
            onClick={() => onPick(character.slug)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13.6px', borderBottom: '1px solid color-mix(in srgb, var(--color-text) 7%, transparent)', cursor: 'pointer', background: character.slug === selected ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : undefined }}
          >
            <span className={base.url ? '' : 'wireframe'} style={{ width: 34, height: 34, flex: 'none', border: '1px solid var(--color-divider)', background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', overflow: 'hidden' }}>
              {base.url && <img src={base.url} alt={character.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{character.name || character.nameOriginal}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 11.5 }}>{characterSubLabelOf(character)}</span>
            </span>
            <span className={`tag ${tag.tagClass}`} style={{ flex: 'none', fontSize: 10, padding: '1px 6px' }}>{tag.label}</span>
          </div>
        );
      })}
      <div className="text-muted" style={{ padding: '10px 13.6px', fontSize: 11, lineHeight: 1.5 }}>Listed by the chapter each character first appears in. A character with no body description keeps a text-only card and is drawn from the frame prompt alone.</div>
    </div>
  );
}

/** The character's drawn images in the order the cards list them — what the slideshow steps through. */
function slidesOf(character: CharacterDesign, style: ArtStyle, images: Record<string, string>): LightboxSlide[] {
  const name = character.name || character.nameOriginal;
  const cards = [
    { image: baseLookImageOf(character, style, images), title: `${name} · Base look`, note: character.body || character.bodyOriginal },
    ...character.outfits.map((outfit) => ({ image: outfitImageOf(character, outfit.slug, style, images), title: `${name} · ${outfit.translated || outfit.original}`, note: outfitSceneLabelOf(outfit) })),
  ];
  return cards.filter((card) => card.image.url !== undefined).map((card) => ({ file: card.image.file, url: card.image.url as string, title: card.title, note: card.note }));
}

/**
 * The step's character design: one base look per character and one card per unique
 * outfit, both built from `world.vi.json`. Each card's prompt is editable and
 * saved into `design.json` — rebuilding derives them again and discards the edits.
 */
export function CharacterDesignPane({ design, style, images, disabled, drawing, onEdit, onRebuild, onGenerate }: CharacterDesignPaneProps) {
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [shown, setShown] = useState<string | undefined>(undefined);
  const character = design.characters.find((candidate) => candidate.slug === selected) ?? design.characters[0];
  const slides = slidesOf(character, style, images);

  const editCharacter = (next: CharacterDesign) => {
    onEdit({ ...design, characters: design.characters.map((candidate) => (candidate.slug === next.slug ? next : candidate)) });
  };

  const editOutfit = (outfit: CharacterOutfitDesign, prompt: string) => {
    editCharacter({ ...character, outfits: character.outfits.map((candidate) => (candidate.slug === outfit.slug ? { ...candidate, prompt } : candidate)) });
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="blueprint" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10.2, padding: '10.2px 20.4px', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)' }}>
        <SparkleIcon width={16} height={16} style={{ flex: 'none', color: 'var(--color-accent-700)' }} />
        <span style={{ fontSize: 13 }}>
          Built from <b>world.vi.json</b>: one <b>base look</b> per character (body · face · features, no outfit) and one card per <b>unique outfit</b>, listing the scenes that wear it. The prompt is the art style + that description.
        </span>
        <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto', fontSize: 13, flex: 'none', gap: 6 }} disabled={disabled} title="Derives every prompt again from the metadata — hand-edited prompts are discarded." onClick={onRebuild}>
          <RefreshIcon width={14} height={14} />
          Rebuild from metadata
        </button>
        <button type="button" className="btn btn-primary" style={{ fontSize: 13, flex: 'none', gap: 6 }} disabled title="Execute the step to draw everything a chapter range needs — from here, draw one card at a time to check the look first.">
          <SparkleIcon width={14} height={14} />
          Generate missing · {designMissingCountOf(design, style, images)}
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <CharacterRail design={design} style={style} images={images} selected={character.slug} onPick={setSelected} />

        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20.4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10.2, marginBottom: 13.6 }}>
            <div style={{ minWidth: 0 }}>
              <div className="text-muted" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>{characterKickerOf(character)}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 17 }}>{character.name || character.nameOriginal}</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6.8, minWidth: 0 }}>
              <span className="text-muted" style={{ fontSize: 12, flex: 'none' }}>Style anchor</span>
              <span className="tag tag-neutral" style={{ fontSize: 11, padding: '2px 8px', maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{artStyleOf(style).anchor}</span>
            </div>
          </div>

          <div className="card-kicker" style={{ margin: '0 0 8px' }}>Base look · body · face · features · no outfit</div>
          <PromptCard
            image={baseLookImageOf(character, style, images)}
            width={SHEET_WIDTH}
            height={SHEET_HEIGHT}
            label="Prompt · art style + base look — editable"
            prompt={character.basePrompt}
            onPrompt={(basePrompt) => editCharacter({ ...character, basePrompt })}
            onGenerate={() => onGenerate(character.slug, BASE_LOOK_SLUG)}
            onOpen={() => setShown(baseLookImageOf(character, style, images).file)}
            disabled={disabled}
            working={drawing === `${character.slug}.${BASE_LOOK_SLUG}`}
            note="Outfits are drawn on top of this look, so regenerate it first."
          >
            <Wording kicker="From world.vi.json · body" original={character.bodyOriginal} translated={character.body} />
          </PromptCard>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20.4px 0 8px' }}>
            <div className="card-kicker" style={{ margin: 0 }}>Outfits · {character.outfits.length} unique</div>
            <span className="text-muted" style={{ fontSize: 11.5 }}>· in the order they are first worn · same wording across scenes is one outfit</span>
          </div>

          {character.outfits.length === 0 ? (
            <div className="text-muted" style={{ fontSize: 12.5 }}>This character is never described wearing anything, so there is nothing to draw beyond the base look.</div>
          ) : (
            character.outfits.map((outfit) => (
              <PromptCard
                key={outfit.slug}
                image={outfitImageOf(character, outfit.slug, style, images)}
                width={SHEET_WIDTH}
                height={SHEET_HEIGHT}
                label="Prompt · art style + base look + outfit — editable"
                prompt={outfit.prompt}
                onPrompt={(prompt) => editOutfit(outfit, prompt)}
                onGenerate={() => onGenerate(character.slug, outfit.slug)}
                onOpen={() => setShown(outfitImageOf(character, outfit.slug, style, images).file)}
                disabled={disabled}
                working={drawing === `${character.slug}.${outfit.slug}`}
                note="Drawn on top of the base look, so the face and body stay the same."
              >
                <div>
                  <Wording kicker={outfitSceneLabelOf(outfit)} original={outfit.original} translated={outfit.translated} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {outfit.scenes.map((scene) => (
                      <span key={scene} className="tag tag-neutral" style={{ fontSize: 10.5, padding: '1px 6px' }}>{scene}</span>
                    ))}
                  </div>
                </div>
              </PromptCard>
            ))
          )}

          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            Images live in <b>illustrations/characters/</b> beside the translations. Changing the art style keeps every image under its own style tag, like voices do for narration.
          </div>
        </div>
      </div>

      <ImageLightbox slides={slides} file={shown} onFile={setShown} />
    </div>
  );
}
