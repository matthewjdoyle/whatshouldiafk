import { useState } from 'react';
import type { Method } from '../../calculations/profit';
import { getMethodIconUrl } from '../methodPresentation';
import type { ProfitStatus } from './graphData';

export default function GraphIcon({ method, profitStatus, size }: {
  method: Method;
  profitStatus?: ProfitStatus;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const url = getMethodIconUrl(method);
  const border = profitStatus === 'profit' ? 'border-2 border-profit' : profitStatus === 'loss' ? 'border-2 border-loss' : 'border border-border-main';

  return (
    <span
      aria-hidden="true"
      style={size === undefined ? undefined : { width: size, height: size }}
      className={`grid size-7 shrink-0 place-items-center ${profitStatus === undefined ? '' : `rounded-full ${border}`}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          style={size === undefined ? undefined : { width: size - 4, height: size - 4 }}
          className="size-6 object-contain"
        />
      ) : (
        <span className="size-2 rounded-full bg-accent" />
      )}
    </span>
  );
}
