import { randomUUID } from 'node:crypto';

import { createDbClient } from '../db/client';
import type { DbClient } from '../db/client';
import {
  createTenantProductData,
  findTenantProductData,
  findTenantProductDataById,
  listTenantProductData,
  countTenantProductData,
  updateTenantProductData,
  softDeleteTenantProductData,
} from './tenant-product-data-queries';

function getTestDbUrl(): string {

  const host = process.env.POSTGRES_TEST_HOST ?? "127.0.0.1";
  const port = Number( process.env.POSTGRES_TEST_PORT ?? "5433" );

  const database = process.env.POSTGRES_TEST_DB
    ?? ( process.env.POSTGRES_DB ? `${ process.env.POSTGRES_DB }_test` : "postgres" );

  const user = process.env.POSTGRES_TEST_USER ?? process.env.POSTGRES_USER ?? "postgres";
  const password = process.env.POSTGRES_TEST_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? "";

  return `postgres://${ encodeURIComponent( user ) }:${ encodeURIComponent( password ) }@${ host }:${ port }/${ database }`;

}

describe( "tenant-product-data queries", () => {

  let db: DbClient;
  let orgAId: string;
  let orgBId: string;

  beforeAll( async () => {

    db = createDbClient( { databaseUrl: getTestDbUrl(), maxConnections: 2 } );

    const [ orgA ] = await db.sql<{ id: string }[]>`
      INSERT INTO organizations ( name, slug ) VALUES ( 'Org A', ${ 'org-a-' + randomUUID() } ) RETURNING id
    `;
    const [ orgB ] = await db.sql<{ id: string }[]>`
      INSERT INTO organizations ( name, slug ) VALUES ( 'Org B', ${ 'org-b-' + randomUUID() } ) RETURNING id
    `;

    orgAId = orgA.id;
    orgBId = orgB.id;

  } );

  afterEach( async () => {
    await db.sql`DELETE FROM tenant_product_data`;
  } );

  afterAll( async () => {
    await db.sql`DELETE FROM organizations WHERE id IN ( ${ orgAId }, ${ orgBId } )`;
    await db.close();
  } );

  it( "creates and finds an override by (organizationId, idType, identifier)", async () => {

    await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
      customFields: { color: 'red' },
    } );

    const found = await findTenantProductData( db, orgAId, { idType: 'upc', value: '041598000539' } );

    expect( found ).not.toBeNull();
    expect( found?.name ).toBe( 'Tenant Name' );
    expect( found?.customFields ).toEqual( { color: 'red' } );
    expect( found?.description ).toBeNull();

  } );

  it( "does not find another org's override (tenant isolation)", async () => {

    await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Org A Name',
    } );

    const found = await findTenantProductData( db, orgBId, { idType: 'upc', value: '041598000539' } );

    expect( found ).toBeNull();

  } );

  it( "finds an override by id, scoped to organizationId", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Tenant Name',
    } );

    expect( await findTenantProductDataById( db, orgAId, created.id ) ).not.toBeNull();
    expect( await findTenantProductDataById( db, orgBId, created.id ) ).toBeNull();

  } );

  it( "lists and counts an org's overrides with pagination", async () => {

    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '111111111111', name: 'One' } );
    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '222222222222', name: 'Two' } );
    await createTenantProductData( db, { organizationId: orgBId, idType: 'upc', identifier: '333333333333', name: 'Three' } );

    const page = await listTenantProductData( db, { organizationId: orgAId, limit: 1, offset: 0 } );
    const total = await countTenantProductData( db, { organizationId: orgAId } );

    expect( page ).toHaveLength( 1 );
    expect( total ).toBe( 2 );

  } );

  it( "partially updates an override, leaving unspecified fields unchanged", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
      brand: 'Original Brand',
    } );

    const updated = await updateTenantProductData( db, orgAId, created.id, { price: 12.5 } );

    expect( updated?.price ).toBe( 12.5 );
    expect( updated?.name ).toBe( 'Original Name' );
    expect( updated?.brand ).toBe( 'Original Brand' );

  } );

  it( "returns null when updating an override outside the caller's org", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
    } );

    const updated = await updateTenantProductData( db, orgBId, created.id, { price: 12.5 } );

    expect( updated ).toBeNull();

  } );

  it( "soft-deletes an override so it no longer appears in find/list", async () => {

    const created = await createTenantProductData( db, {
      organizationId: orgAId,
      idType: 'upc',
      identifier: '041598000539',
      name: 'Original Name',
    } );

    const deleted = await softDeleteTenantProductData( db, orgAId, created.id );
    expect( deleted ).toBe( true );

    expect( await findTenantProductDataById( db, orgAId, created.id ) ).toBeNull();
    expect( await listTenantProductData( db, { organizationId: orgAId, limit: 20, offset: 0 } ) ).toHaveLength( 0 );

  } );

  it( "returns false when soft-deleting an override that doesn't exist", async () => {
    expect( await softDeleteTenantProductData( db, orgAId, randomUUID() ) ).toBe( false );
  } );

  it( "rejects a duplicate (organizationId, idType, identifier)", async () => {

    await createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '041598000539', name: 'First' } );

    await expect(
      createTenantProductData( db, { organizationId: orgAId, idType: 'upc', identifier: '041598000539', name: 'Second' } )
    ).rejects.toThrow();

  } );

} );
