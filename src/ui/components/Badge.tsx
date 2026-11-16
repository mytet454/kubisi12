/**
 * src/ui/components/Badge.tsx
 * Backward-compatible alias wrapping StatusBadge so all existing screens
 * automatically inherit icon + word non-color-only discipline and tokens.
 */
import React from 'react';
import { StatusBadge, StatusBadgeProps } from './StatusBadge';

export type BadgeProps = StatusBadgeProps;

export const Badge: React.FC<BadgeProps> = (props) => {
  return <StatusBadge {...props} />;
};
