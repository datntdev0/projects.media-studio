import { useState } from 'react';
import { ChevronDownIcon, EditIcon, PlusIcon, TrashIcon } from '@/components/icons';
import type { CharacterWeight, WorldCharacter } from '@/shared/app-workspace-extraction';
import { CHARACTER_WEIGHT_LABEL, WEIGHT_OPTIONS, characterChapterLabel, formatList, formatRelationshipLines, formatRelationships, parseList, parseRelationshipLines, sceneRowsOf, timelineKeyLabel } from './worldFormat';
import { WorldEditDialog, type WorldEditField } from './WorldEditDialog';

interface WorldCharacterTableProps {
  characters: WorldCharacter[];
  /** Every scene id in the bible, so a keyed detail can be filed under one of them. */
  timelineIdxs: string[];
  onChange(characters: WorldCharacter[]): void;
}

/** Which row is being edited, and as what — a character's own fields, or one of its scenes. */
type Editing = { at: number; scene: string | undefined };

const RELATIONSHIP_HINT = 'One per line, as `what they are: other character`.';

function withoutKey<T>(map: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(map).filter(([candidate]) => candidate !== key));
}

/** The scene a newly added detail is filed under — the first one nothing is recorded for. */
function firstFreeIdx(timelineIdxs: string[], taken: string[]): string {
  return timelineIdxs.find((idx) => !taken.includes(idx)) ?? timelineIdxs[0] ?? '';
}

/** The two controls at the end of a row. */
function RowActions({ onEdit, onRemove }: { onEdit(): void; onRemove(): void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
      <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Edit" onClick={onEdit}>
        <EditIcon width={14} height={14} />
      </button>
      <button type="button" className="btn btn-secondary btn-icon" style={{ borderColor: 'transparent', width: 26, height: 26 }} title="Remove" onClick={onRemove}>
        <TrashIcon width={14} height={14} />
      </button>
    </div>
  );
}

/**
 * The characters of the world bible, one expandable row each: the facts that
 * hold across the novel on the row itself, and what changes with the story —
 * outfit and relationships — in the per-scene block underneath.
 */
export function WorldCharacterTable({ characters, timelineIdxs, onChange }: WorldCharacterTableProps) {
  const [expanded, setExpanded] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);

  const replace = (at: number, character: WorldCharacter) => onChange(characters.map((candidate, position) => (position === at ? character : candidate)));

  const editFields = ({ at, scene }: Editing): WorldEditField[] => {
    const character = characters[at];
    if (scene === undefined) {
      return [
        { key: 'name', label: 'Name', value: character.name },
        { key: 'alias', label: 'Aliases', value: formatList(character.alias), hint: 'Every other name the novel calls them, separated by commas.' },
        { key: 'weight', label: 'Weight', value: character.weight, options: WEIGHT_OPTIONS, optionLabel: (weight) => CHARACTER_WEIGHT_LABEL[weight as CharacterWeight] },
        { key: 'body', label: 'Body · face · features', value: character.body, rows: 3, hint: 'What does not change between chapters.' },
      ];
    }

    return [
      { key: 'idx', label: 'Chapter · scene', value: scene, options: timelineIdxs.includes(scene) ? timelineIdxs : [scene, ...timelineIdxs], optionLabel: timelineKeyLabel },
      { key: 'clothing', label: 'Clothing · style', value: character.appearance[scene] ?? '', rows: 2 },
      { key: 'relationships', label: 'Relationships', value: formatRelationshipLines(character.relationships[scene] ?? []), rows: 4, hint: RELATIONSHIP_HINT },
    ];
  };

  const applyEdit = (target: Editing, values: Record<string, string>) => {
    const character = characters[target.at];

    if (target.scene === undefined) {
      replace(target.at, { ...character, name: values.name, alias: parseList(values.alias), weight: values.weight as CharacterWeight, body: values.body });
    } else {
      const appearance = withoutKey(character.appearance, target.scene);
      const relationships = withoutKey(character.relationships, target.scene);
      const links = parseRelationshipLines(values.relationships);
      if (values.clothing.trim()) appearance[values.idx] = values.clothing;
      if (links.length > 0) relationships[values.idx] = links;
      replace(target.at, { ...character, appearance, relationships });
    }

    setEditing(undefined);
  };

  const removeScene = (at: number, scene: string) => {
    const character = characters[at];
    replace(at, { ...character, appearance: withoutKey(character.appearance, scene), relationships: withoutKey(character.relationships, scene) });
  };

  const addScene = (at: number) => {
    const character = characters[at];
    const idx = firstFreeIdx(timelineIdxs, sceneRowsOf(character).map((scene) => scene.idx));
    replace(at, { ...character, appearance: { ...character.appearance, [idx]: '' } });
    setEditing({ at, scene: idx });
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '22%' }}>Character</th>
            <th style={{ width: '24%' }}>Alias</th>
            <th style={{ width: '54%' }}>Body · face · features</th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        {characters.map((character, at) => (
          <tbody key={`${character.name}-${at}`}>
            <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === at ? undefined : at)}>
              <td>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{character.name}</div>
                <div className="text-muted" style={{ fontSize: 11.5 }}>{characterChapterLabel(character)}</div>
              </td>
              <td style={{ fontSize: 13 }}>{character.alias.join(' · ') || '—'}</td>
              <td style={{ fontSize: 13 }}>{character.body || '—'}</td>
              <td style={{ textAlign: 'right', paddingRight: 13.6 }}>
                <ChevronDownIcon width={15} height={15} style={{ opacity: 0.5, transform: expanded === at ? 'rotate(180deg)' : undefined }} />
              </td>
            </tr>

            {expanded === at && (
              <tr>
                <td colSpan={4} style={{ padding: '13.6px 17px', background: 'color-mix(in srgb, var(--color-text) 2.5%, transparent)' }}>
                  <div className="card-kicker" style={{ margin: '0 0 8px' }}>Per chapter · scene</div>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '26%' }}>Chapter · scene</th>
                        <th style={{ width: '37%' }}>Clothing · style</th>
                        <th style={{ width: '37%' }}>Relationships</th>
                        <th style={{ width: 60 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {sceneRowsOf(character).map((scene) => (
                        <tr key={scene.idx}>
                          <td style={{ fontSize: 12.5 }}>{timelineKeyLabel(scene.idx)}</td>
                          <td style={{ fontSize: 12.5 }}>{scene.clothing || '—'}</td>
                          <td style={{ fontSize: 12.5 }}>{formatRelationships(scene.relationships) || '—'}</td>
                          <td><RowActions onEdit={() => setEditing({ at, scene: scene.idx })} onRemove={() => removeScene(at, scene.idx)} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: 'flex', gap: 6.8, marginTop: 10, alignItems: 'center' }}>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={() => setEditing({ at, scene: undefined })}>
                      <EditIcon width={13} height={13} />
                      Edit character
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={() => addScene(at)}>
                      <PlusIcon width={13} height={13} />
                      Add scene
                    </button>
                    <span className="text-muted" style={{ fontSize: 11.5 }}>Clothing and relationships are tracked per scene — the chapters between scenes inherit the last one.</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        ))}
      </table>

      {editing && (
        <WorldEditDialog
          title={editing.scene === undefined ? `Edit ${characters[editing.at].name}` : `${characters[editing.at].name} · ${timelineKeyLabel(editing.scene)}`}
          fields={editFields(editing)}
          onCancel={() => setEditing(undefined)}
          onSave={(values) => applyEdit(editing, values)}
        />
      )}
    </>
  );
}
