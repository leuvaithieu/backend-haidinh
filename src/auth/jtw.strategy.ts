
import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from '../user/user.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly userService: UserService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  // Xác thực tài khoản từ database và lấy quyền mới nhất sau khi JWT hợp lệ.
  async validate(payload: any) {
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Token không hợp lệ!');
    }

    const user = await this.userService.findOne(payload.sub);

    if (!user) {
        throw new UnauthorizedException('Tài khoản không tồn tại!');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Tài khoản đã bị khóa!');
    }

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    };
  }
}
