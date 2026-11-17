import { useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import type { usePlayerData } from '../hooks/usePlayerData';
import { normalizeRsn } from '../player/profile';
import type { SkillName } from '../player/profile';

// Row order in the in-game skill tab, including Sailing in the bottom-right slot.
const skillOrder = [
  'Attack', 'Hitpoints', 'Mining',
  'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing',
  'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking',
  'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming',
  'Construction', 'Hunter', 'Sailing',
] as const satisfies readonly SkillName[];

export default function PlayerLookup({ player }: { player: ReturnType<typeof usePlayerData> }) {
  const profile = player.profile;
  const [rsn, setRsn] = useState(profile?.displayName ?? '');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pending = player.status === 'loading';
  const duplicate = pending && normalizeRsn(rsn).toLowerCase() === player.pendingUsername;
  const open = !dismissed && (hovered || focused) && !!(profile || pending || player.message);
  const complete = profile && skillOrder.every(skill => profile.levels[skill] !== undefined);
  const total = complete ? skillOrder.reduce((sum, skill) => sum + (profile.levels[skill] ?? 0), 0) : null;
  const status = [
    pending ? `Loading levels for ${player.pendingUsername}…` : '',
    player.message,
    profile ? `${player.saved ? 'Saved levels' : 'Levels'} for ${profile.displayName}. Snapshot: ${new Date(profile.snapshotAt).toLocaleString()}.` : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="group/player relative z-30 w-40 sm:w-44"
      onPointerEnter={event => {
        if (event.pointerType !== 'touch') { setHovered(true); setDismissed(false); }
      }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => { setFocused(true); setDismissed(false); }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          setDismissed(true);
          event.stopPropagation();
        }
      }}>
      <form aria-label="Player lookup" onSubmit={event => {
        event.preventDefault();
        setDismissed(false);
        if (!normalizeRsn(rsn)) {
          player.clear();
          setRsn('');
        } else {
          void player.load(rsn);
        }
      }}>
        <label htmlFor="player-rsn" className="sr-only">RuneScape name (RSN)</label>
        <input id="player-rsn" value={rsn} onChange={event => { setRsn(event.target.value); setDismissed(false); }}
          autoComplete="off" spellCheck={false} placeholder="RuneScape name"
          aria-describedby="player-lookup-status" aria-controls={open ? 'player-levels-popout' : undefined}
          className="w-full min-w-0 rounded border border-main bg-input py-1.5 pl-3 pr-8 text-sm text-main outline-none hover:border-sub focus:border-accent focus:ring-1 focus:ring-accent" />
        <button type="submit" aria-label="Load or reload RSN levels" title="Load or reload levels (Enter)" disabled={duplicate}
          className={`absolute top-0 right-0 flex h-full w-8 items-center justify-center rounded-r text-muted hover:text-accent focus-visible:outline-2 focus-visible:outline-accent cursor-pointer disabled:cursor-wait transition-opacity group-hover/player:opacity-100 group-focus-within/player:opacity-100 [@media(hover:none)]:opacity-100 ${pending ? 'opacity-100' : 'opacity-0'}`}>
          <RefreshCcw aria-hidden="true" className={`w-3.5 h-3.5 ${pending ? 'motion-safe:animate-spin' : ''}`} />
        </button>
      </form>
      <span id="player-lookup-status" role="status" className="sr-only">{status}</span>
      {open && <div className="absolute top-full left-0 w-[236px] max-w-[calc(100vw-2rem)] pt-2">
        <section id="player-levels-popout" aria-label="Player levels" className="osrs-skills rounded-lg overflow-hidden border border-main">
          {profile && <>
            <p className="truncate px-1 pb-1 text-center text-base" title={profile.displayName}>{profile.displayName}</p>
            <dl className="grid grid-cols-3 gap-px">
              {skillOrder.map(skill => {
                const level = profile.levels[skill];
                return <div key={skill} data-skill={skill} className="osrs-skill rounded border border-main" title={`${skill}: ${level ?? 'Unknown'}`}>
                  <dt className="sr-only">{skill}</dt>
                  <dd>
                    <img src={`${import.meta.env.BASE_URL}osrs/skills/${skill.toLowerCase()}.png`} alt="" className="osrs-skill-icon" />
                    <span className="sr-only">{level ?? 'Unknown'}</span>
                    <span aria-hidden="true" className="osrs-skill-level">{level ?? '?'}</span>
                    <span aria-hidden="true" className="osrs-skill-divider" />
                    <span aria-hidden="true" className="osrs-skill-base">{level ?? '?'}</span>
                  </dd>
                </div>;
              })}
            </dl>
            <p className="osrs-total rounded border border-main">Total level: {total ?? 'Unknown'}</p>
            <p className="px-1 pt-1 text-center font-sans text-[10px] leading-snug text-sub">
              {player.saved ? 'Saved · ' : ''}<time dateTime={profile.snapshotAt}>{new Date(profile.snapshotAt).toLocaleString()}</time>
            </p>
            {!complete && <p className="px-1 pt-1 font-sans text-[10px] leading-snug text-sub">? = unknown. Unknown levels do not exclude methods from the RSN filter.</p>}
          </>}
          {(pending || player.message) && <p className="px-1 pt-1 font-sans text-xs leading-relaxed text-main">
            {pending && <>Loading {player.pendingUsername}… </>}{player.message}
            {profile && (pending || player.status === 'error') && <> Still using {profile.displayName}&apos;s levels.</>}
          </p>}
        </section>
      </div>}
    </div>
  );
}
