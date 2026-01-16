import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Listing } from './listing.entity';
import { Review } from './review.entity';

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PAID = 'paid',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('bookings')
@Index(['startDate', 'endDate'])
@Index(['status'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Listing, (listing) => listing.bookings)
  @JoinColumn({ name: 'listingId' })
  listing: Listing;

  @Column()
  listingId: string;

  @ManyToOne(() => User, (user) => user.bookings)
  @JoinColumn({ name: 'renterId' })
  renter: User;

  @Column()
  renterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'hostId' })
  host: User; // Denormalized for easy queries

  @Column()
  hostId: string;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number; // TND

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  commission: number; // TND

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.PENDING,
  })
  status: BookingStatus;

  @Column({ type: 'boolean', default: false })
  paid: boolean;

  @Column({ type: 'jsonb', nullable: true })
  paymentInfo: Record<string, any> | null;

  @OneToOne(() => Review, (review) => review.booking)
  review: Review;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
