import { useState } from 'react';
import { ChevronDownIcon, EditIcon } from '@/components/icons';
import type { WorldCharacter } from '@/shared/app-workspace-extraction';
import type { WorldTranslationCharacter } from '@/shared/app-workspace-translation';
import { Bilingual } from './translationFormat';
import { characterChapterLabel, formatList, formatRelationshipLines, formatRelationships, parseList, parseRelationshipLines, sceneRowsOf, timelineKeyLabel } from './worldFormat';
import { RowActions } from './RowActions';
import { WorldEditDialog, type WorldEditField } from './WorldEditDialog';

interface TranslationCharacterTableProps {
  characters: WorldTranslationCharacter[];
  /** The world bible the translation is of, so every row can show what it renders. */
  source: WorldCharacter[];
  onChange(characters: WorldTranslationCharacter[]): void;
}

/** Which row is being edited, and as what — the character's own fields, or one of its scenes. */
type Editing = { at: number; scene: string | undefined };

/** Translated aliases re-paired with their originals by position — a missing one keeps the original. */
function pairAliases(character: WorldTranslationCharacter, translated: string[]): WorldTranslationCharacter['alias'] {
  return character.alias.map((alias, at) => ({ nameOriginal: alias.nameOriginal, name: translated[at] ?? alias.nameOriginal }));
}

/**
 * The world translation's characters beside the originals they render, one
 * expandable row each — the per-scene block underneath pairs each outfit and set
 * of relationships with the original wording.
 */
export function TranslationCharacterTable({ characters, source, onChange }: TranslationCharacterTableProps) {
  const [expanded, setExpanded] = useState<number | undefined>(undefined);
  const [editing, setEditing] = useState<Editing | undefined>(undefined);

  const originalOf = (character: WorldTranslationCharacter): WorldCharacter | undefined => source.find((candidate) => candidate.name === character.nameOriginal);
  const replace = (at: number, character: WorldTranslationCharacter) => onChange(characters.map((candidate, position) => (position === at ? character : candidate)));

  const editFields = ({ at, scene }: Editing): WorldEditField[] => {
    const character = characters[at];
    if (scene === undefined) {
      return [
        { key: 'name', label: `Name · ${character.nameOriginal}`, value: character.name },
        { key: 'alias', label: 'Aliases', value: formatList(character.alias.map((alias) => alias.name)), hint: `In this order: ${formatList(character.alias.map((alias) => alias.nameOriginal)) || 'none'}. Separate with commas.` },
        { key: 'body', label: 'Body · face · features', value: character.body, rows: 3, hint: originalOf(character)?.body },
      ];
    }
    const original = originalOf(character);
    return [
      { key: 'clothing', label: 'Clothing · style', value: character.appearance[scene] ?? '', rows: 2, hint: original?.appearance[scene] },
      { key: 'relationships', label: 'Relationships', value: formatRelationshipLines(character.relationships[scene] ?? []), rows: 4, hint: `One per line, as \`what they are: other character\`. Original: ${formatRelationships(original?.relationships[scene] ?? []) || '—'}` },
    ];
  };

  const applyEdit = (target: Editing, values: Record<string, string>) => {
    const character = characters[target.at];
    if (target.scene === undefined) {
      replace(target.at, { ...character, name: values.name, alias: pairAliases(character, parseList(values.alias)), body: values.body });
    } else {
      replace(target.at, { ...character, appearance: { ...character.appearance, [target.scene]: values.clothing }, relationships: { ...character.relationships, [target.scene]: parseRelationshipLines(values.relationships) } });
    }
    setEditing(undefined);
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '25%' }}>Character</th>
            <th style={{ width: '40%' }}>Alias</th>
            <th style={{ width: '35%' }}>Body · face · features</th>
          </tr>
        </thead>
        {characters.map((character, at) => {
          const original = originalOf(character);
          return (
            <tbody key={`${character.nameOriginal}-${at}`}>
              <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === at ? undefined : at)}>
                <td>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 15 }}>{character.name}</div>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{character.nameOriginal} · {characterChapterLabel(character)}</div>
                </td>
                <td><Bilingual original={character.alias.map((alias) => alias.nameOriginal).join(' · ')} translated={character.alias.map((alias) => alias.name).join(' · ')} /></td>
                <td><Bilingual original={original?.body ?? ''} translated={character.body} /></td>
                <td style={{ textAlign: 'right', paddingRight: 13.6 }}>
                  <ChevronDownIcon width={15} height={15} style={{ opacity: 0.5, transform: expanded === at ? 'rotate(180deg)' : undefined }} />
                </td>
              </tr>

              {expanded === at && (
                <tr>
                  <td colSpan={4} style={{ padding: '13.6px 17px', background: 'color-mix(in srgb, var(--color-text) 2.5%, transparent)' }}>
                    <div className="card-kicker" style={{ margin: '0 0 8px' }}>Per chapter · scene · original over translation</div>
                    <table className="table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: '20%' }}>Chapter · scene</th>
                          <th style={{ width: '30%' }}>Clothing · style</th>
                          <th style={{ width: '50%' }}>Relationships</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {sceneRowsOf(character).map((scene) => (
                          <tr key={scene.idx}>
                            <td style={{ fontSize: 12.5 }}>{timelineKeyLabel(scene.idx)}</td>
                            <td><Bilingual original={original?.appearance[scene.idx] ?? ''} translated={scene.clothing} size={12.5} /></td>
                            <td><Bilingual original={formatRelationships(original?.relationships[scene.idx] ?? [])} translated={formatRelationships(scene.relationships)} size={12.5} /></td>
                            <td><RowActions onEdit={() => setEditing({ at, scene: scene.idx })} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', gap: 6.8, marginTop: 10, alignItems: 'center' }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: 12, gap: 6 }} onClick={() => setEditing({ at, scene: undefined })}>
                        <EditIcon width={13} height={13} />
                        Edit character
                      </button>
                      <span className="text-muted" style={{ fontSize: 11.5 }}>Scenes mirror the world bible — translate the metadata again to pick up ones added since.</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
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
