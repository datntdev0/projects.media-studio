import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUrl, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { LibraryContentStatus, LibraryContentType } from '../entities/library-content.entity';
import { MAX_INDEX, MAX_URL } from './library-content.constants';
import { AudioContentDto, ImageContentDto, TextContentDto, VideoContentDto } from './library-content.dto';

export class CreateLibraryContentDto {
  @ApiProperty({ description: 'A chapter only. Defaults to the next number up.', example: 412 })
  @IsInt() @Min(0) @Max(MAX_INDEX)
  idx!: number;

  @ApiProperty({ description: 'The type of the content.', enum: LibraryContentType })
  @IsEnum(LibraryContentType)
  type!: LibraryContentType;

  @ApiProperty({ description: 'The status of the content.', enum: LibraryContentStatus })
  @IsEnum(LibraryContentStatus)
  status!: LibraryContentStatus;

  @ApiPropertyOptional({ description: 'Where the piece came from. Left out for a row added by hand.' })
  @IsOptional() @IsUrl() @MaxLength(MAX_URL)
  sourceUrl?: string | null;

  @ApiPropertyOptional({ description: 'The text content of the library item, shape depends on the `type`.', type: TextContentDto })
  @IsOptional() @ValidateNested() @Type(() => TextContentDto)
  textContent?: TextContentDto | null;

  @ApiPropertyOptional({ description: 'The audio content of the library item, shape depends on the `type`.', type: AudioContentDto })
  @IsOptional() @ValidateNested() @Type(() => AudioContentDto)
  audioContent?: AudioContentDto | null;

  @ApiPropertyOptional({ description: 'The image content of the library item, shape depends on the `type`.', type: ImageContentDto })
  @IsOptional() @ValidateNested() @Type(() => ImageContentDto)
  imageContent?: ImageContentDto | null;

  @ApiPropertyOptional({ description: 'The video content of the library item, shape depends on the `type`.', type: VideoContentDto })
  @IsOptional() @ValidateNested() @Type(() => VideoContentDto)
  videoContent?: VideoContentDto | null;
}
