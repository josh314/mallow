import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { userRoles } from '../users/types';
import { loginBody } from '../routes/auth';
import { createOrgBody, createUserBody, listOrgsQuery, listUsersQuery } from '../routes/organizations';
import { getProductDataQuery } from '../routes/product-data';

extendZodWithOpenApi( z );

const registry = new OpenAPIRegistry();

// ─── Security ─────────────────────────────────────────────────────────────────

registry.registerComponent( 'securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'connect.sid',
} );

const cookieAuth = [ { cookieAuth: [] } ];

// ─── Shared schemas ───────────────────────────────────────────────────────────

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

const orgIdParam   = z.object( { id: z.string().uuid() } );
const userIdParams = z.object( { id: z.string().uuid(), userId: z.string().uuid() } );

const ProductData = registry.register( 'ProductData',
  z.object( {
    barcode: z.string(),
    name: z.string(),
    description: z.string().optional(),
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

// ─── GET /organizations ───────────────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/organizations',
  summary: 'List organizations',
  description: 'Superadmin only.',
  security: cookieAuth,
  request: { query: listOrgsQuery },
  responses: {
    ...jsonResponse( 200, 'Paginated organization list', z.object( {
      organizations: z.array( Organization ),
      total:  z.number().int(),
      limit:  z.number().int(),
      offset: z.number().int(),
    } ) ),
    ...errorResponse( 400, 'Invalid query params' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Not a superadmin' ),
  },
} );

// ─── GET /organizations/:id ───────────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/organizations/{id}',
  summary: 'Get an organization',
  description: 'Superadmin or any member of that organization.',
  security: cookieAuth,
  request: { params: orgIdParam },
  responses: {
    ...jsonResponse( 200, 'Organization found', z.object( { organization: Organization } ) ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Forbidden' ),
    ...errorResponse( 404, 'Organization not found' ),
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

// ─── GET /organizations/:id/users ─────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/organizations/{id}/users',
  summary: 'List users in an organization',
  description: 'Superadmin or owner/manager of that organization.',
  security: cookieAuth,
  request: { params: orgIdParam, query: listUsersQuery },
  responses: {
    ...jsonResponse( 200, 'Paginated user list', z.object( {
      users:  z.array( PublicUser ),
      total:  z.number().int(),
      limit:  z.number().int(),
      offset: z.number().int(),
    } ) ),
    ...errorResponse( 400, 'Invalid query params' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Forbidden' ),
  },
} );

// ─── GET /organizations/:id/users/:userId ─────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/organizations/{id}/users/{userId}',
  summary: 'Get a user',
  description: 'Superadmin, owner/manager of that organization, or the user themselves.',
  security: cookieAuth,
  request: { params: userIdParams },
  responses: {
    ...jsonResponse( 200, 'User found', z.object( { user: PublicUser } ) ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 403, 'Forbidden' ),
    ...errorResponse( 404, 'User not found' ),
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

// ─── GET /product-data ────────────────────────────────────────────────────────

registry.registerPath( {
  method: 'get',
  path: '/product-data',
  summary: 'Look up product data by barcode',
  security: cookieAuth,
  request: { query: getProductDataQuery },
  responses: {
    ...jsonResponse( 200, 'Product data found', z.object( { productData: ProductData } ) ),
    ...errorResponse( 400, 'Invalid or missing barcode' ),
    ...errorResponse( 401, 'Not authenticated' ),
    ...errorResponse( 404, 'No product data found for barcode' ),
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
