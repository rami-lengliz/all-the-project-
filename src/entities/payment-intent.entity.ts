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
import { Booking } from './booking.entity';
import { User } from './user.entity';

export enum PaymentIntentStatus {
  CREATED = 'created',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled',
}

@Entity('payment_intents')
@Index(['bookingId'])
@Index(['status'])
@Index(['renterId'])
export class PaymentIntent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Booking)
  @JoinColumn({ name: 'bookingId' })
  booking: Booking;

  @Column({ unique: true })
  bookingId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'renterId' })
  renter: User;

  @Column()
  renterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'hostId' })
  host: User;

  @Column()
  hostId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number; // TND

  @Column({ type: 'varchar', length: 3, default: 'TND' })
  currency: string;

  @Column({
    type: 'enum',
    enum: PaymentIntentStatus,
    default: PaymentIntentStatus.CREATED,
  })
  status: PaymentIntentStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
