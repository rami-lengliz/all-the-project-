import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Listing } from './listing.entity';

@Entity('categories')
@Index(['slug'], { unique: true })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string | null;

  @Column({ type: 'boolean', default: true })
  allowed_for_private: boolean;

  @OneToMany(() => Listing, (listing) => listing.category)
  listings: Listing[];

  @CreateDateColumn()
  createdAt: Date;
}
