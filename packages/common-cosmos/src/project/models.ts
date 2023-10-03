// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {ProcessorImpl} from '@subql/common';
import {FileReference, Processor} from '@subql/types-core';
import {
  SubqlCosmosEventFilter,
  SubqlCosmosHandlerKind,
  SubqlCosmosCustomHandler,
  SubqlCosmosMapping,
  SubqlCosmosHandler,
  SubqlCosmosRuntimeHandler,
  SubqlCosmosRuntimeDatasource,
  SubqlCosmosDatasourceKind,
  SubqlCosmosCustomDatasource,
  CustomDataSourceAsset,
  SubqlCosmosBlockFilter,
  SubqlCosmosBlockHandler,
  SubqlCosmosEventHandler,
  SubqlCosmosMessageFilter,
  SubqlCosmosTransactionHandler,
  SubqlCosmosMessageHandler,
  CustomModule,
  SubqlCosmosTxFilter,
  SubqlCosmosProcessorOptions,
} from '@subql/types-cosmos';
import {plainToClass, Transform, Type} from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsObject,
  ValidateNested,
  ValidateIf,
  IsBoolean,
  Validate,
} from 'class-validator';
import {FileReferenceImp} from './utils';

export class CosmosBlockFilter implements SubqlCosmosBlockFilter {
  @IsOptional()
  @IsInt()
  modulo?: number;
  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class CosmosTxFilter implements SubqlCosmosTxFilter {
  @IsOptional()
  @IsBoolean()
  includeFailedTx?: boolean;
}

export class CosmosMessageFilter extends CosmosTxFilter implements SubqlCosmosMessageFilter {
  @IsString()
  type: string;
  @IsOptional()
  @IsObject()
  values?: {[key: string]: string};
  @ValidateIf((o) => o.type === '/cosmwasm.wasm.v1.MsgExecuteContract')
  @IsOptional()
  @IsString()
  contractCall?: string;
}

export class CosmosEventFilter implements SubqlCosmosEventFilter {
  @IsString()
  type: string;
  @IsOptional()
  @Type(() => CosmosMessageFilter)
  messageFilter?: SubqlCosmosMessageFilter;
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string | number>;
}

export class CosmosBlockHandler implements SubqlCosmosBlockHandler {
  @IsEnum(SubqlCosmosHandlerKind, {groups: [SubqlCosmosHandlerKind.Block]})
  kind: SubqlCosmosHandlerKind.Block;
  @IsString()
  handler: string;
  @IsOptional()
  @Type(() => CosmosBlockFilter)
  filter?: SubqlCosmosBlockFilter;
}

export class CosmosTransactionHandler implements SubqlCosmosTransactionHandler {
  @IsEnum(SubqlCosmosHandlerKind, {groups: [SubqlCosmosHandlerKind.Transaction]})
  kind: SubqlCosmosHandlerKind.Transaction;
  @IsString()
  handler: string;
}

export class CosmosMessageHandler implements SubqlCosmosMessageHandler {
  @IsEnum(SubqlCosmosHandlerKind, {groups: [SubqlCosmosHandlerKind.Message]})
  kind: SubqlCosmosHandlerKind.Message;
  @IsString()
  handler: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => CosmosMessageFilter)
  filter?: CosmosMessageFilter;
}

export class CosmosEventHandler implements SubqlCosmosEventHandler {
  @IsOptional()
  @ValidateNested()
  @Type(() => CosmosEventFilter)
  filter?: SubqlCosmosEventFilter;
  @IsEnum(SubqlCosmosHandlerKind, {groups: [SubqlCosmosHandlerKind.Event]})
  kind: SubqlCosmosHandlerKind.Event;
  @IsString()
  handler: string;
}

export class CosmosCustomHandler implements SubqlCosmosCustomHandler {
  @IsString()
  kind: string;
  @IsString()
  handler: string;
  @IsObject()
  @IsOptional()
  filter?: Record<string, unknown>;
}

export class CosmosMapping implements SubqlCosmosMapping {
  @Transform((params) => {
    const handlers: SubqlCosmosHandler[] = params.value;
    return handlers.map((handler) => {
      switch (handler.kind) {
        case SubqlCosmosHandlerKind.Event:
          return plainToClass(CosmosEventHandler, handler);
        case SubqlCosmosHandlerKind.Message:
          return plainToClass(CosmosMessageHandler, handler);
        case SubqlCosmosHandlerKind.Transaction:
          return plainToClass(CosmosTransactionHandler, handler);
        case SubqlCosmosHandlerKind.Block:
          return plainToClass(CosmosBlockHandler, handler);
        default:
          throw new Error(`handler ${(handler as any).kind} not supported`);
      }
    });
  })
  @IsArray()
  @ValidateNested()
  handlers: SubqlCosmosHandler[];
  @IsString()
  file: string;
}

export class CosmosCustomMapping implements SubqlCosmosMapping<SubqlCosmosCustomHandler> {
  @IsArray()
  @Type(() => CosmosCustomHandler)
  @ValidateNested()
  handlers: CosmosCustomHandler[];
  @IsString()
  file: string;
}

export class CosmosProcessorOptions implements SubqlCosmosProcessorOptions {
  @IsOptional()
  @IsString()
  abi?: string;
}

export class CosmosRuntimeDataSourceBase<M extends SubqlCosmosMapping<SubqlCosmosRuntimeHandler>>
  implements SubqlCosmosRuntimeDatasource<M>
{
  @IsEnum(SubqlCosmosDatasourceKind, {groups: [SubqlCosmosDatasourceKind.Runtime]})
  kind: SubqlCosmosDatasourceKind.Runtime;
  @Type(() => CosmosMapping)
  @ValidateNested()
  mapping: M;
  @IsInt()
  startBlock: number;
  @Type(() => CosmosCustomModuleImpl)
  @ValidateNested({each: true})
  chainTypes: CosmosChainTypes;
  @IsOptional()
  @Validate(FileReferenceImp)
  assets?: Map<string, FileReference>;
  @IsOptional()
  @Type(() => CosmosProcessorOptions)
  @ValidateNested()
  options?: CosmosProcessorOptions;
}

export class CosmosFileReferenceImpl implements FileReference {
  @IsString()
  file: string;
}

export type CosmosChainTypes = Map<string, CosmosCustomModuleImpl>;

export class CosmosCustomModuleImpl implements CustomModule {
  @IsString()
  file: string;
  @IsArray()
  @Type(() => String)
  messages: string[];
}

export class CosmosCustomDataSourceBase<
  K extends string,
  M extends SubqlCosmosMapping = SubqlCosmosMapping<SubqlCosmosCustomHandler>,
  O = any
> implements SubqlCosmosCustomDatasource<K, M, O>
{
  @IsString()
  kind: K;
  @Type(() => CosmosCustomMapping)
  @ValidateNested()
  mapping: M;
  @IsOptional()
  @IsInt()
  startBlock?: number;
  @Type(() => CosmosFileReferenceImpl)
  @ValidateNested({each: true})
  assets: Map<string, CustomDataSourceAsset>;
  @Type(() => ProcessorImpl)
  @IsObject()
  processor: Processor<O>;
  @Type(() => CosmosCustomModuleImpl)
  @ValidateNested({each: true})
  chainTypes: CosmosChainTypes;
}
