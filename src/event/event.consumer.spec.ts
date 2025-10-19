import { Test, TestingModule } from '@nestjs/testing';
import { EventConsumerService } from './event.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { NatsConsumerService } from '../nats/nats-consumer.service';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { JsMsg } from 'nats';

describe('EventConsumerService', () => {
  let service: EventConsumerService;
  let prismaService: PrismaService;
  let metricsService: MetricsService;

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    assign: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      facebookEvent: {
        create: jest.fn(),
      },
    };

    const mockMetricsService = {
      incrementEventsReceived: jest.fn(),
      incrementEventsProcessed: jest.fn(),
      incrementEventsFailed: jest.fn(),
      recordEventProcessingDuration: jest.fn(),
    };

    const mockNatsService = {
      subscribe: jest.fn(),
      publish: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: EventConsumerService,
          useFactory: () => {
            return new EventConsumerService(
              mockLogger as any,
              mockNatsService as any,
              mockPrismaService as any,
              mockMetricsService as any,
            );
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: NatsConsumerService,
          useValue: mockNatsService,
        },
      ],
    }).compile();

    service = module.get<EventConsumerService>(EventConsumerService);
    prismaService = module.get<PrismaService>(PrismaService);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleFacebookEvent', () => {
    const validEvent = {
      eventId: 'evt_123',
      timestamp: '2025-01-15T10:00:00Z',
      source: 'facebook',
      funnelStage: 'top',
      eventType: 'ad.view',
      data: {
        user: {
          userId: 'user_123',
          name: 'John Doe',
          age: 30,
          gender: 'male',
          location: {
            country: 'US',
            city: 'New York',
          },
        },
        engagement: {
          actionTime: '2025-01-15T10:00:00Z',
          referrer: 'newsfeed',
          videoId: null,
        },
      },
    };

    let mockMsg: any;

    beforeEach(() => {
      mockMsg = {
        subject: 'events.facebook',
        ack: jest.fn(),
        nak: jest.fn(),
      } as unknown as JsMsg;
      jest.clearAllMocks();
    });

    it('should process valid event successfully', async () => {
      const createSpy = jest
        .spyOn(prismaService.facebookEvent, 'create')
        .mockResolvedValue({} as any);

      await (service as any).handleFacebookEvent(validEvent, mockMsg);

      expect(createSpy).toHaveBeenCalledWith({
        data: {
          eventId: validEvent.eventId,
          timestamp: new Date(validEvent.timestamp),
          funnelStage: validEvent.funnelStage,
          eventType: validEvent.eventType,
          data: validEvent.data,
        },
      });

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(metricsService.incrementEventsProcessed).toHaveBeenCalledWith(
        'facebook',
      );
      expect(metricsService.recordEventProcessingDuration).toHaveBeenCalledWith(
        'facebook',
        expect.any(Number),
      );
    });

    it('should handle validation errors', async () => {
      const invalidEvent = {
        eventId: 'evt_123',
      };

      await (service as any).handleFacebookEvent(invalidEvent, mockMsg);

      expect(mockMsg.ack).toHaveBeenCalled();
      expect(metricsService.incrementEventsFailed).toHaveBeenCalledWith(
        'facebook',
        'validation_error',
      );
      expect(metricsService.recordEventProcessingDuration).toHaveBeenCalledWith(
        'facebook',
        expect.any(Number),
      );
    });

    it('should handle processing errors', async () => {
      jest
        .spyOn(prismaService.facebookEvent, 'create')
        .mockRejectedValue(new Error('Database error'));

      await (service as any).handleFacebookEvent(validEvent, mockMsg);

      expect(mockMsg.ack).not.toHaveBeenCalled();
      expect(metricsService.incrementEventsFailed).toHaveBeenCalledWith(
        'facebook',
        'processing_error',
      );
      expect(metricsService.recordEventProcessingDuration).toHaveBeenCalledWith(
        'facebook',
        expect.any(Number),
      );
    });
  });
});
