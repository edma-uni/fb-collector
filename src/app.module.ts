import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { MetricsModule } from './metrics/metrics.module';
import { EventModule } from './event/event.module';
import { randomUUID } from 'crypto';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'yyyy-mm-dd HH:MM:ss',
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        formatters: {
          level: (label: string) => {
            return { level: label };
          },
        },
        customProps: () => ({
          correlationId: randomUUID(),
        }),
        serializers: {
          req: (req: any) => ({
            method: req.method,
            url: req.url,
          }),
          res: (res: any) => ({
            statusCode: res.statusCode,
          }),
        },
      },
    }),
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
        config: {
          prefix: 'collector_',
        },
      },
      path: '/metrics',
      defaultLabels: {
        app: 'fb-collector',
        environment: process.env.NODE_ENV || 'development',
      },
    }),
    PrismaModule,
    MetricsModule,
    EventModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
