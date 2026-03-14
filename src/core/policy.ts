import type {
  Action,
  Classification,
  Finding,
  Identity,
  Policy,
  RequestContext,
  Rule,
} from './types.ts';
import { ACTION_RESTRICTIVENESS as RESTRICT } from './types.ts';

export function selectRule(
  identity: Identity,
  context: RequestContext,
  policy: Policy,
): Rule {
  for (const rule of policy.rules) {
    if (matchesRule(identity, context, rule)) return rule;
  }
  return policy.default_rule;
}

function matchesRule(identity: Identity, context: RequestContext, rule: Rule): boolean {
  const m = rule.match;
  if (!m) return true;

  if (m.users_any?.length && !m.users_any.includes(identity.user)) return false;
  if (m.groups_any?.length && !m.groups_any.some((g) => identity.groups.includes(g))) return false;
  if (m.resources_any?.length) {
    const resource = context.resource as string | undefined;
    if (!resource || !m.resources_any.includes(resource)) return false;
  }
  if (m.purposes_any?.length) {
    const purpose = context.purpose as string | undefined;
    if (!purpose || !m.purposes_any.includes(purpose)) return false;
  }
  if (m.regions_any?.length) {
    const region = context.region as string | undefined ?? identity.attributes.region;
    if (!region || !m.regions_any.includes(region)) return false;
  }
  return true;
}

export function resolveAction(
  normalizedPath: string,
  classification: Classification | null,
  findings: Finding[],
  rule: Rule,
): Action {
  const pathAction = rule.path_actions[normalizedPath];
  if (pathAction) return pathAction;

  if (classification) {
    const classAction = rule.class_actions[classification.class];
    if (classAction) return classAction;
    return rule.default_action;
  }

  if (findings.length > 0) {
    return resolveInlineAction(findings, rule);
  }

  return rule.unknown_action;
}

function resolveInlineAction(findings: Finding[], rule: Rule): Action {
  let most: Action = 'allow';
  for (const f of findings) {
    const action = rule.class_actions[f.class] ?? rule.default_action;
    const effective = inlineEquivalent(action);
    if (RESTRICT[effective]! > RESTRICT[most]!) most = effective;
  }
  return most;
}

function inlineEquivalent(action: Action): Action {
  if (action === 'mask' || action === 'last4' || action === 'year_only' || action === 'hash') {
    return 'mask_inline';
  }
  return action;
}

export function mergeFindings(findings: Finding[]): Finding[] {
  if (findings.length <= 1) return findings;
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Finding[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]!;
    const last = merged[merged.length - 1]!;
    if (current.start < last.end) {
      const keepAction = RESTRICT[
        inlineEquivalent(
          current.confidence >= last.confidence ? 'mask_inline' : 'allow',
        )
      ]! >= RESTRICT[inlineEquivalent('mask_inline')]!;
      last.end = Math.max(last.end, current.end);
      if (keepAction && current.confidence > last.confidence) {
        last.class = current.class;
        last.confidence = current.confidence;
      }
    } else {
      merged.push(current);
    }
  }
  return merged;
}
