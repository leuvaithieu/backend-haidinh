
import { Module } from '@nestjs/common';

import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';

import { TicketModule } from '../ticket/ticket.module';

import { 
    NotificationProviderRegistry,
    NOTIFICATION_PROVIDERS
    } from './notification-provider.registry';
import { NotificationRateLimiterService } from './notification-rate-limiter.service';

import { EmailNotificationProvider } from './providers/email-notification.provider';
import { QrCodeService } from './qr-code.service';


@Module({
    
    imports: [TicketModule],
    controllers: [NotificationController],

    providers: [
        NotificationService,
        NotificationWorkerService,

        NotificationProviderRegistry,
        NotificationRateLimiterService,

        EmailNotificationProvider,
        QrCodeService,

        {
        provide: NOTIFICATION_PROVIDERS,
        useFactory: (
            emailProvider: EmailNotificationProvider,
        ) => [emailProvider],
        inject: [EmailNotificationProvider],
        },
    ],

    exports: [
        NotificationService,
        NotificationWorkerService,
        NotificationProviderRegistry,
        NotificationRateLimiterService,
    ],
})
export class NotificationModule {}
