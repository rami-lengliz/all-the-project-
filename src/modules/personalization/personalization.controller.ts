import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PersonalizationService } from './personalization.service';

@ApiTags('personalization')
@Controller('api')
export class PersonalizationController {
  constructor(private readonly personalization: PersonalizationService) {}

  /**
   * Personalized feed for the home page. Works for anonymous users too
   * (cold-start: quality + location + freshness).
   */
  @Get('feed/recommended')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Personalized listing feed (cold-start fallback for anonymous users)' })
  async recommended(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    const userId = req.user?.sub ?? req.user?.id ?? null;
    const results = await this.personalization.recommend(userId, {
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
    });
    return results.map((r) => ({ ...r.listing, _score: r.score, _reasons: r.reasons }));
  }

  /** "Trending this week" — most-booked listings in the last 7 days. */
  @Get('feed/trending')
  @Public()
  @ApiOperation({ summary: 'Most-booked listings in the last 7 days (quality fallback)' })
  async trending(@Query('limit') limit?: string) {
    return this.personalization.trending(limit ? parseInt(limit, 10) : 8);
  }

  /** "Because you viewed X" — similar to the user's most recent viewed listing. */
  @Get('feed/because-you-viewed')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Listings similar to the last one the user viewed (null if none)' })
  async becauseYouViewed(@Request() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.sub ?? req.user?.id ?? null;
    return this.personalization.becauseYouViewed(userId, limit ? parseInt(limit, 10) : 8);
  }

  /** "You might also like" — content-similarity from a given listing. */
  @Get('listings/:id/similar')
  @Public()
  @ApiOperation({ summary: 'Listings semantically similar to a given listing' })
  async similar(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.personalization.findSimilarListings(
      id,
      limit ? parseInt(limit, 10) : 6,
    );
  }

  /**
   * Record a "view" interaction. Fire-and-forget from the frontend (called
   * when a card enters the viewport for ≥1s). Throttled to prevent abuse.
   */
  @Post('listings/:id/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Record that the current user viewed this listing' })
  async recordView(@Param('id') id: string, @Request() req: any) {
    const userId = req.user.sub ?? req.user.id;
    await this.personalization.recordInteraction(userId, id, 'VIEW');
    return { ok: true };
  }

  /** Admin: how many listings have embeddings vs. still need them. */
  @Get('admin/personalization/embeddings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Embedding coverage stats (admin only)' })
  async embeddingStats() {
    return this.personalization.embeddingStats();
  }

  /** Admin: manually trigger an embedding backfill pass. */
  @Post('admin/personalization/backfill-embeddings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Run an embedding backfill pass now (admin only)' })
  async backfillEmbeddings() {
    return this.personalization.runBackfill();
  }
}
