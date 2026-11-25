import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

/** Valida query/body con un esquema zod y devuelve el valor ya convertido. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException(
        r.error.issues.map(
          (i) => `${i.path.join('.') || 'valor'}: ${i.message}`,
        ),
      );
    }
    return r.data;
  }
}
