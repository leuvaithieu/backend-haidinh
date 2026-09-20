import { Module } from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt'
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from 'src/user/user.module';
import { JwtStrategy } from './jtw.strategy';

@Module({
  imports:[
    UserModule,
    JwtModule.register({
      secret:process.env.JWT_SECRET,
      signOptions:{
        expiresIn:'1d',
      }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy]
})
export class AuthModule {}
