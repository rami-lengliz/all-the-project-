import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Listing } from './listing.entity';
import { Booking } from './booking.entity';
import { Review } from './review.entity';
import { AdminLog } from './admin-log.entity';

@Entity('users')
@Index(['email'])
@Index(['phone'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'simple-array', default: 'user' })
  roles: string[];

  @Column({ type: 'boolean', default: false })
  isHost: boolean;

  @Column({ type: 'boolean', default: false })
  verifiedEmail: boolean;

  @Column({ type: 'boolean', default: false })
  verifiedPhone: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  ratingAvg: number;

  @Column({ type: 'int', default: 0 })
  ratingCount: number;

  @OneToMany(() => Listing, (listing) => listing.host)
  listings: Listing[];

  @OneToMany(() => Booking, (booking) => booking.renter)
  bookings: Booking[];

  @OneToMany(() => Review, (review) => review.author)
  reviews: Review[];

  @OneToMany(() => AdminLog, (log) => log.actor)
  adminLogs: AdminLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
