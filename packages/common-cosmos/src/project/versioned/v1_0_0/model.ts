// Copyright 2020-2023 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: GPL-3.0

import {
  FileType,
  NodeSpec,
  ParentProject,
  ParentProjectModel,
  ProjectManifestBaseImpl,
  QuerySpec,
  RunnerNodeImpl,
  RunnerQueryBaseModel,
  RunnerSpecs,
  validateObject,
} from '@subql/common';
import {
  CustomModule,
  SubqlCosmosCustomDatasource,
  SubqlCosmosCustomHandler,
  SubqlCosmosMapping,
  SubqlCosmosRuntimeDatasource,
  SubqlCosmosRuntimeHandler,
} from '@subql/types-cosmos';
import {plainToClass, Transform, TransformFnParams, Type} from 'class-transformer';
import {
  Equals,
  IsObject,
  IsString,
  ValidateNested,
  validateSync,
  IsOptional,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import {CosmosCustomDataSourceBase, CosmosCustomModuleImpl, CosmosRuntimeDataSourceBase} from '../../models';
import {CosmosProjectManifestV1_0_0, CustomDatasourceTemplate, RuntimeDatasourceTemplate} from './types';

const COSMOS_NODE_NAME = `@subql/node-cosmos`;

export class CosmosRunnerNodeImpl extends RunnerNodeImpl {
  @Equals(COSMOS_NODE_NAME, {message: `Runner Cosmos node name incorrect, suppose be '${COSMOS_NODE_NAME}'`})
  name: string;
}

export class CosmosRuntimeDataSourceImpl
  extends CosmosRuntimeDataSourceBase<SubqlCosmosMapping<SubqlCosmosRuntimeHandler>>
  implements SubqlCosmosRuntimeDatasource
{
  validate(): void {
    return validateObject(this, 'failed to validate runtime datasource.');
  }
}

export class CosmosCustomDataSourceImpl<
    K extends string = string,
    M extends SubqlCosmosMapping = SubqlCosmosMapping<SubqlCosmosCustomHandler>
  >
  extends CosmosCustomDataSourceBase<K, M>
  implements SubqlCosmosCustomDatasource<K, M>
{
  validate(): void {
    return validateObject(this, 'failed to validate custom datasource.');
  }
}

export class CosmosProjectNetworkDeployment {
  @IsString()
  @IsNotEmpty()
  @Transform(({value}: TransformFnParams) => value.trim())
  chainId: string;
  @Type(() => CosmosCustomModuleImpl)
  @IsOptional()
  @ValidateNested({each: true})
  chainTypes?: Map<string, CustomModule>;
  @IsOptional()
  @IsArray()
  bypassBlocks?: (number | string)[];
}

export class CosmosProjectNetwork extends CosmosProjectNetworkDeployment {
  @IsString({each: true})
  @IsOptional()
  endpoint?: string | string[];
  @IsString()
  @IsOptional()
  dictionary?: string;
}

export class RuntimeDatasourceTemplateImpl extends CosmosRuntimeDataSourceImpl implements RuntimeDatasourceTemplate {
  @IsString()
  name: string;
}

export class CustomDatasourceTemplateImpl extends CosmosCustomDataSourceImpl implements CustomDatasourceTemplate {
  @IsString()
  name: string;
}

export class CosmosRunnerSpecsImpl implements RunnerSpecs {
  @IsObject()
  @ValidateNested()
  @Type(() => CosmosRunnerNodeImpl)
  node: NodeSpec;
  @IsObject()
  @ValidateNested()
  @Type(() => RunnerQueryBaseModel)
  query: QuerySpec;
}

export class DeploymentV1_0_0 {
  @Equals('1.0.0')
  @IsString()
  specVersion: string;
  @ValidateNested()
  @Type(() => CosmosProjectNetworkDeployment)
  network: CosmosProjectNetworkDeployment;
  @IsObject()
  @ValidateNested()
  @Type(() => CosmosRunnerSpecsImpl)
  runner: RunnerSpecs;
  @ValidateNested()
  @Type(() => FileType)
  schema: FileType;
  @IsArray()
  @ValidateNested()
  @Type(() => CosmosCustomDataSourceImpl, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: CosmosRuntimeDataSourceImpl, name: 'cosmos/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  dataSources: (SubqlCosmosRuntimeDatasource | SubqlCosmosCustomDatasource)[];
  @IsOptional()
  @IsArray()
  @ValidateNested()
  @Type(() => CustomDatasourceTemplateImpl, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: RuntimeDatasourceTemplateImpl, name: 'cosmos/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  templates?: (RuntimeDatasourceTemplate | CustomDatasourceTemplate)[];

  @IsOptional()
  @IsObject()
  @Type(() => ParentProjectModel)
  parent?: ParentProject;
}

export class ProjectManifestV1_0_0Impl
  extends ProjectManifestBaseImpl<DeploymentV1_0_0>
  implements CosmosProjectManifestV1_0_0
{
  @Equals('0.3.0')
  specVersion: string;
  @IsString()
  name: string;
  @IsString()
  version: string;
  @IsObject()
  @ValidateNested()
  @Type(() => CosmosProjectNetwork)
  network: CosmosProjectNetwork;
  @ValidateNested()
  @Type(() => FileType)
  schema: FileType;
  @IsArray()
  @ValidateNested()
  @Type(() => CosmosCustomDataSourceImpl, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: CosmosRuntimeDataSourceImpl, name: 'cosmos/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  dataSources: (SubqlCosmosRuntimeDatasource | SubqlCosmosCustomDatasource)[];
  @IsOptional()
  @IsArray()
  @ValidateNested()
  @Type(() => CustomDatasourceTemplateImpl, {
    discriminator: {
      property: 'kind',
      subTypes: [{value: RuntimeDatasourceTemplateImpl, name: 'cosmos/Runtime'}],
    },
    keepDiscriminatorProperty: true,
  })
  templates?: (RuntimeDatasourceTemplate | CustomDatasourceTemplate)[];
  @IsObject()
  @ValidateNested()
  @Type(() => CosmosRunnerSpecsImpl)
  runner: RunnerSpecs;
  protected _deployment: DeploymentV1_0_0;

  @IsOptional()
  @IsObject()
  @Type(() => ParentProjectModel)
  parent?: ParentProject;

  get deployment(): DeploymentV1_0_0 {
    if (!this._deployment) {
      this._deployment = plainToClass(DeploymentV1_0_0, this);
      validateSync(this._deployment, {whitelist: true});
    }
    return this._deployment;
  }
}
