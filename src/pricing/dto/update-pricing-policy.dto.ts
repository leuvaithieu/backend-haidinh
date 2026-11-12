
import { PartialType } from '@nestjs/mapped-types';
import { CreatePricingPolicyDto } from './create-pricing-policy.dto';

// DTO cập nhật chính sách giá, kế thừa các trường từ DTO tạo mới và chuyển thành không bắt buộc.
export class UpdatePricingPolicyDto extends PartialType(
  CreatePricingPolicyDto,
) {}
