import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'success' | 'outline' | 'text' | 'danger' | 'danger-text';

export function Button({
  variant = 'primary',
  block,
  large,
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ComponentPropsWithRef<'button'> & {
  variant?: Variant;
  block?: boolean;
  large?: boolean;
  icon?: IconName;
  children?: ReactNode;
}) {
  const cls = ['btn', `btn--${variant}`, block ? 'btn--block' : '', large ? 'btn--lg' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={20} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  primary,
  small,
  className = '',
  type = 'button',
  ...rest
}: ComponentPropsWithRef<'button'> & {
  icon: IconName;
  label: string;
  primary?: boolean;
  small?: boolean;
}) {
  const cls = ['iconbtn', primary ? 'iconbtn--primary' : '', small ? 'iconbtn--sm' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={small ? 20 : 24} />
    </button>
  );
}
