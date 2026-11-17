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
      className={`flex size-7 shrink-0 items-center justify-center ${profitStatus === undefined ? '' : `rounded-full ${border}`}`}
    >
      {url && !failed ? (
        <img
          src={url}
          alt=""
          onError={() => setFailed(true)}
          style={size === undefined ? undefined : { width: Math.max(0, size - (profitStatus === undefined ? 0 : 4)), height: Math.max(0, size - (profitStatus === undefined ? 0 : 4)) }}
          className="block size-6 object-contain object-center"
        />
      ) : (
        <span className="size-2 rounded-full bg-accent" />
      )}
    </span>
  );
}
