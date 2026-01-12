import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Booking } from './booking.entity';
import { Review } from './review.entity';
import { Point } from 'geojson';

export enum BookingType {
  DAILY = 'DAILY',
  // HOURLY = 'HOURLY', // TODO: Implement hourly booking logic
}

@Entity('listings')
@Index(['location'], { spatial: true })
@Index(['pricePerDay'])
@Index(['category'])
@Index(['isActive'])
@Index(['deletedAt'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.listings)
  @JoinColumn({ name: 'hostId' })
  host: User;

  @Column()
  hostId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @ManyToOne(() => Category, (category) => category.listings)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  @Column()
  categoryId: string;

  @Column({ type: 'simple-array', nullable: true })
  images: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerDay: number; // TND

  // PostGIS Point geometry for location
  @Column({
    type: 'geometry',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location: Point;

  @Column({ type: 'varchar', length: 500 })
  address: string;

  @Column({ type: 'text', nullable: true })
  rules: string | null;

  @Column({ type: 'jsonb', nullable: true })
  availability: Array<{ startDate: string; endDate: string }> | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({
    type: 'enum',
    enum: BookingType,
    default: BookingType.DAILY,
  })
  bookingType: BookingType;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Booking, (booking) => booking.listing)
  bookings: Booking[];

  @OneToMany(() => Review, (review) => review.listing)
  reviews: Review[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
