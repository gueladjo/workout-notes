import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from './Button';
import type { IconName } from './Icon';

/**
 * App bar shared by every screen. `leading` defaults to a back button when `back` is set.
 */
export function TopBar({
  title,
  subtitle,
  back,
  onBack,
  leadingIcon,
  leadingLabel,
  onLeading,
  actions,
  primary,
  onTitleClick,
  titleId,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Navigate back (router history) when the leading button is pressed. */
  back?: boolean;
  onBack?: () => void;
  leadingIcon?: IconName;
  leadingLabel?: string;
  onLeading?: () => void;
  actions?: ReactNode;
  primary?: boolean;
  onTitleClick?: () => void;
  titleId?: string;
}) {
  const navigate = useNavigate();
  const showLeading = back || leadingIcon;
  const leading = leadingIcon ?? 'back';
  const handleLeading = () => {
    if (onLeading) return onLeading();
    if (onBack) return onBack();
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  return (
    <header className={`topbar${primary ? ' topbar--primary' : ''}`}>
      {showLeading ? (
        <IconButton icon={leading} label={leadingLabel ?? 'Back'} onClick={handleLeading} />
      ) : (
        <span style={{ width: 8 }} />
      )}
      {onTitleClick ? (
        <button className="topbar__title" onClick={onTitleClick} id={titleId} style={{ textAlign: 'left' }}>
          {title}
          {subtitle && <span className="topbar__subtitle">{subtitle}</span>}
        </button>
      ) : (
        <div className="topbar__title" id={titleId}>
          {title}
          {subtitle && <span className="topbar__subtitle">{subtitle}</span>}
        </div>
      )}
      <div className="topbar__actions">{actions}</div>
    </header>
  );
}
