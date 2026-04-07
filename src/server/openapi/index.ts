import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { userRoles } from '../users/types';
import { loginBody } from '../routes/auth';
import { createOrgBody, createUserBody } from '../routes/organizations';

extendZodWithOpenApi( z );

const registry = new OpenAPIRegistry();

// ─── Security ─────────────────────────────────────────────────────────────────

registry.registerComponent( 'securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'connect.sid',
} );

const cookieAuth = [ { cookieAuth: [] } ];

// ─── Shared response schemas ───────────────────────────────────────────────────

const ErrorResponse = registry.register( 'ErrorResponse',
  z.object( {
    error: z.literal( true ),
    message: z.string(),
  } )
);

const Organization = registry.register( 'Organization',
  z.object( {
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  } )
);

const PublicUser = registry.register( 'PublicUser',
  z.object( {
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.enum( userRoles ),
    isSuperadmin: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  } )
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonBody( schema: z.ZodTypeAny ) {
  return { content: { 'application/json': { schema } } };
}

function jsonResponse( status: number, description: string, schema: z.ZodTypeAny ) {
  return { [ status ]: { description, content: { 'application/json': { schema } } } };
}

const errorResponse = ( status: number, description: string ) => ( {
  [ status ]: { description, content: { 'application/json': { schema: ErrorResponse } } },
} );

// ─── GET /health ──────────────────────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/health',
  summary: 'Health check',
  responses: jsonResponse( 200, 'Server is healthy', z.object( {
    status: z.literal( 'ok' ),
    version: z.string(),
  } ) ),
} );

// ─── POST /auth/login ─────────────────────────────────────────────────────────

registry.registerPath( {
  method: 'post',
  path: '/auth/login',
  summary: 'Log in',
  request: { body: jsonBody( loginBody ) },
  responses: {
    ...jsonResponse( 200, 'Login successful — session cookie set', z.object( { user: PublicUser } ) ),
    ...errorResponse( 400, 'Invalid request body' ),
    ...errorResponse( 401, 'Invalid email or password' ),
  },
} );

// ─── POST /auth/logout ────────────────────────────────────────────────────────

registry.registerPath( {
  method: 'post',
  path: '/auth/logout',
  summary: 'Log out',
  responses: {
    204: { description: 'Session destroyed' },
  },
} );

// ─── POST /organizations ──────────────────────────────────────────────────────

registry.registerPath( {
  method: 'post',
  path: '/organizations',
  summary: 'Create an organization',
  description: 'Superadmin only.',
  security: cookieAuth,
  request: { body: jsonBody( createOrgBody ) },
  responses: {
    ...jsonResponse( 201, 'Organization created', z.object( { organization: Organization } ) ),
    ...errorResponse( 400, 'Invalid request body' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Not a superadmin' ),
    ...errorResponse( 409, 'Slug already taken' ),
  },
} );

// ─── POST /organizations/:id/users ────────────────────────────────────────────

registry.registerPath( {
  method: 'post',
  path: '/organizations/{id}/users',
  summary: 'Create a user in an organization',
  description: 'Superadmin (any org) or owner/manager (own org only). Non-superadmins may only assign roles strictly lower than their own.',
  security: cookieAuth,
  request: {
    params: z.object( { id: z.string().uuid() } ),
    body: jsonBody( createUserBody ),
  },
  responses: {
    ...jsonResponse( 201, 'User created', z.object( { user: PublicUser } ) ),
    ...errorResponse( 400, 'Invalid request body' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Wrong org or insufficient role' ),
    ...errorResponse( 404, 'Organization not found' ),
    ...errorResponse( 409, 'Email already in use' ),
  },
} );

// ─── Spec generator ───────────────────────────────────────────────────────────

export function buildOpenApiSpec() {

  const generator = new OpenApiGeneratorV3( registry.definitions );

  return generator.generateDocument( {
    openapi: '3.0.0',
    info: {
      title: 'Mallow API',
      version: '0.0.0',
    },
  } );

}
