import { Injectable, UnauthorizedException } from '@nestjs/common';
import *as bcrypt from 'bcryptjs'
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService:UserService,
        private readonly jwtService:JwtService,
    ){}

    // Kiểm tra thông tin đăng nhập và trạng thái tài khoản.
    async validateUser(
        username:string,
        password:string,
    ){
        const user = await this.userService.findByUsername(username);

        if(!user){
            throw new UnauthorizedException('Tên đăng nhập hoặc mật khẩu không đúng !')
        };

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if(!isPasswordValid){
            throw new UnauthorizedException("Tên đăng nhập hoặc mật khẩu không đúng !")
        }

        // Từ chối đăng nhập nếu tài khoản đã bị khóa.
        if (user.status !== 'ACTIVE') {
            throw new UnauthorizedException('Tài khoản đã bị khóa!');
        }

        return {
            id:user.id,
            username:user.username,
            name:user.name,
            phone:user.phone,
            role:user.role,
            status:user.status,
        }
    };

    // Đăng nhập và cấp JWT cho người dùng.
    async login(username:string, password:string){
        const user = await this.validateUser(
            username,
            password,
        );

        const payload ={
            sub:user.id,
            username : user.username,
            role: user.role,
            name:user.name,
        };

        return {
            access_token : await this.jwtService.signAsync(payload),
            user,
        }
    }
}
