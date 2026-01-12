import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Listing } from './listing.entity';
import { Booking } from './booking.entity';

@Entity('reviews')
@Index(['targetUserId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Booking, (booking) => booking.review)
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @Column({ unique: true })
  bookingId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column()
  authorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'targetUserId' })
  targetUser: User;

  @Column()
  targetUserId: string;

  @ManyToOne(() => Listing, (listing) => listing.reviews)
  @JoinColumn({ name: 'listingId' })
  listing: Listing;

  @Column()
  listingId: string;

  @Column({ type: 'int' })
  rating: number; // 1-5

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
