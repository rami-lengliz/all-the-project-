import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnablePostgis1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_listings_location" 
      ON listings USING GIST (location);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_listings_pricePerDay" 
      ON listings (pricePerDay);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_listings_categoryId" 
      ON listings (categoryId);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_categoryId";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_pricePerDay";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_location";`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis;`);
  }
}

