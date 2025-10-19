import { Injectable, OnModuleInit } from '@nestjs/common';
import { JsMsg } from 'nats';
import { ZodError } from 'zod';
import { randomUUID } from 'crypto';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import { NatsConsumerService } from '../nats/nats-consumer.service';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { facebookEventSchema } from '../pipes/event.schema';

@Injectable()
export class EventConsumerService implements OnModuleInit {
  constructor(
    @InjectPinoLogger(EventConsumerService.name)
    private readonly logger: PinoLogger,
    private readonly natsConsumer: NatsConsumerService,
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async onModuleInit() {
    await this.subscribeToFacebookEvents();
  }

  private async subscribeToFacebookEvents() {
    const subject = 'events.facebook';

    this.logger.info(`Subscribing to subject: ${subject}`);

    await this.natsConsumer.subscribe(
      subject,
      this.handleFacebookEvent.bind(this),
      'fb-collector-facebook',
    );

    this.logger.info(`Successfully subscribed to ${subject}`);
  }

  private async handleFacebookEvent(data: unknown, msg: JsMsg): Promise<void> {
    const startTime = Date.now();
    const subject = msg.subject;
    const correlationId = randomUUID();

    this.logger.debug(
      { subject, correlationId },
      'Processing message from NATS',
    );

    try {
      const validatedEvent = facebookEventSchema.parse(data);

      this.logger.debug(
        {
          data: validatedEvent,
          correlationId,
          eventId: validatedEvent.eventId,
          source: validatedEvent.source,
          eventType: validatedEvent.eventType,
          funnelStage: validatedEvent.funnelStage,
        },
        'Event validated successfully',
      );

      await this.prisma.facebookEvent.create({
        data: {
          eventId: validatedEvent.eventId,
          timestamp: new Date(validatedEvent.timestamp),
          funnelStage: validatedEvent.funnelStage,
          eventType: validatedEvent.eventType,
          data: validatedEvent.data,
        },
      });

      this.logger.debug('Event persisted to database');

      msg.ack();

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metrics.incrementEventsProcessed(validatedEvent.source);
      this.metrics.recordEventProcessingDuration(
        validatedEvent.source,
        durationSeconds,
      );

      this.logger.info(
        { correlationId, durationSeconds },
        'Event processed successfully',
      );
    } catch (error) {
      if (error instanceof ZodError) {
        this.logger.warn(
          { validationErrors: error.issues },
          'Event validation failed',
        );

        msg.ack();

        this.metrics.incrementEventsFailed('facebook', 'validation_error');
      } else {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          { error: errorMessage, stack: errorStack },
          'Event processing failed',
        );

        this.metrics.incrementEventsFailed('facebook', 'processing_error');
      }

      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metrics.recordEventProcessingDuration('facebook', durationSeconds);
    }
  }
}
