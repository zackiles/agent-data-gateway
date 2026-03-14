export type Action =
  | 'allow'
  | 'drop'
  | 'null'
  | 'mask'
  | 'mask_inline'
  | 'last4'
  | 'year_only'
  | 'hash';

export const ACTION_RESTRICTIVENESS: Record<Action, number> = {
  drop: 7,
  null: 6,
  mask_inline: 5,
  mask: 4,
  last4: 3,
  year_only: 2,
  hash: 1,
  allow: 0,
};

export interface Identity {
  user: string;
  groups: string[];
  attributes: Record<string, string>;
}

export interface RequestContext {
  resource?: string;
  purpose?: string;
  region?: string;
  [key: string]: unknown;
}

export interface PathClass {
  class: string;
  confidence: number;
  count: number;
}

export interface Detector {
  id: string;
  class: string;
  mode: 'fullmatch' | 'contains';
  pattern: string;
  confidence: number;
}

export interface CompiledDetector extends Detector {
  regex: RegExp;
}

export interface Index {
  version: number;
  path_classes: Record<string, PathClass>;
  key_classes: Record<string, PathClass>;
  detectors: Detector[];
}

export interface CompiledIndex {
  version: number;
  path_classes: Record<string, PathClass>;
  key_classes: Record<string, PathClass>;
  detectors: CompiledDetector[];
}

export interface MatchBlock {
  users_any?: string[];
  groups_any?: string[];
  resources_any?: string[];
  purposes_any?: string[];
  regions_any?: string[];
}

export interface Rule {
  match?: MatchBlock;
  default_action: Action;
  unknown_action: Action;
  class_actions: Record<string, Action>;
  path_actions: Record<string, Action>;
}

export interface Policy {
  version: number;
  default_rule: Rule;
  rules: Rule[];
}

export interface Classification {
  path: string;
  class: string;
  source: 'path' | 'key' | 'detector' | 'reasoning';
  confidence: number;
}

export interface Finding {
  class: string;
  source: 'detector-inline' | 'reasoning-inline';
  confidence: number;
  start: number;
  end: number;
}

export interface Decision {
  path: string;
  class?: string;
  source?: string;
  confidence?: number;
  action: Action;
  reasoning?: string;
}

export interface LeafNode {
  path: string;
  normalizedPath: string;
  key: string;
  value: unknown;
  parent: Record<string, unknown> | unknown[];
  parentKey: string | number;
}

export interface SanitizeRequest {
  context: RequestContext;
  payload: unknown;
  explain?: boolean;
}

export interface ClassifyRequest {
  payload: unknown;
}

export interface BuildRequest {
  samples: Array<{ payload: unknown }>;
}

export interface ClassifyResult {
  path: string;
  class?: string;
  source?: string;
  confidence?: number;
  findings?: Finding[];
}

export interface ReasoningConfig {
  enabled: boolean;
  cli: 'claude' | 'cursor';
  model?: string;
  timeout: number;
  minConfidence: number;
  maxSamples: number;
  cooldown: number;
  promptFile: string;
}

export interface GitleaksConfig {
  enabled: boolean;
}

export interface Config {
  adapter: string;
  index: string;
  policy: string;
  port: number;
  configFile?: string;
  adapterConfig: Record<string, string>;
  reasoning: ReasoningConfig;
  gitleaks: GitleaksConfig;
}
