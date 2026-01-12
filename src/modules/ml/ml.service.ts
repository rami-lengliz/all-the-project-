import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class MlService {
  private readonly mlServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.mlServiceUrl = this.configService.get<string>('ml.serviceUrl');
  }

  async suggestCategory(data: {
    images?: string[];
    title?: string;
  }): Promise<{ suggestedCategorySlug: string; confidence: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.mlServiceUrl}/ml/suggest-category`, data),
      );
      return response.data;
    } catch (error) {
      // Fallback to mock response if ML service is unavailable
      console.warn('ML service unavailable, using mock response', error.message);
      return this.mockSuggestCategory(data);
    }
  }

  async suggestPrice(data: {
    categorySlug: string;
    location: { latitude: number; longitude: number };
    images?: string[];
    baseFields?: Record<string, any>;
  }): Promise<{ suggestedPricePerDay: number }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.mlServiceUrl}/ml/suggest-price`, {
          categorySlug: data.categorySlug,
          lat: data.location.latitude,
          lng: data.location.longitude,
          images: data.images,
          baseFields: data.baseFields,
        }),
      );
      return response.data;
    } catch (error) {
      // Fallback to mock response if ML service is unavailable
      console.warn('ML service unavailable, using mock response', error.message);
      return this.mockSuggestPrice(data);
    }
  }

  private mockSuggestCategory(data: {
    images?: string[];
    title?: string;
  }): { suggestedCategorySlug: string; confidence: number } {
    // Simple keyword-based mock matching ML service logic
    const text = (data.title || '').toLowerCase();
    const imageFilenames = (data.images || []).join(' ').toLowerCase();
    const combinedText = `${text} ${imageFilenames}`;

    if (combinedText.includes('paddle') || combinedText.includes('kayak') || 
        combinedText.includes('beach') || combinedText.includes('water') ||
        combinedText.includes('surf') || combinedText.includes('snorkel')) {
      return { suggestedCategorySlug: 'water-beach-activities', confidence: 0.85 };
    }

    if (combinedText.includes('scooter') || combinedText.includes('motor') || 
        combinedText.includes('car') || combinedText.includes('bike') ||
        combinedText.includes('bicycle') || combinedText.includes('vehicle')) {
      return { suggestedCategorySlug: 'mobility', confidence: 0.80 };
    }

    return { suggestedCategorySlug: 'accommodation', confidence: 0.60 };
  }

  private mockSuggestPrice(data: {
    categorySlug: string;
    location: { latitude: number; longitude: number };
  }): { suggestedPricePerDay: number } {
    // Base prices by category (in TND)
    const basePrices: Record<string, number> = {
      accommodation: 150.0,
      mobility: 60.0,
      'water-beach-activities': 30.0,
    };

    const basePrice = basePrices[data.categorySlug] || 100.0;
    return { suggestedPricePerDay: Math.round(basePrice * 100) / 100 };
  }
}

