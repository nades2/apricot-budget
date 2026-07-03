import { SetMetadata } from '@nestjs/common';

/** Marker read by JwtAuthGuard to skip authentication on decorated routes. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
