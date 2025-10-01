# Prompt for Generating Frigate Config Field Help

## Your Mission

You are tasked with creating comprehensive, actionable help documentation for EVERY configuration field in Frigate NVR's configuration schema. This help will be displayed in a GUI config editor to assist users who find raw YAML intimidating.

## The Problem

The Frigate configuration schema has ~500+ fields with descriptions like:
- "Map of object labels to their attribute labels" ❌ (useless - doesn't say what's valid)
- "Enable camera" ❌ (obvious)
- "MQTT configuration" ❌ (too vague)

We need to transform these into actually helpful documentation that answers:
1. **What does this field do?** (in plain English)
2. **What are ALL valid values?** (complete lists, not "e.g.")
3. **What's a real-world example?** (practical, copy-pasteable)
4. **Where in the docs can I learn more?** (direct link to the exact section, not just the page)

## Your Resources

1. **Frigate Documentation** (SOURCE OF TRUTH): https://docs.frigate.video/
   - Configuration reference: https://docs.frigate.video/configuration/
   - Start here and explore EVERY configuration page
   - This is THE authoritative source for what fields do and valid values

2. **Project Repository**: https://github.com/DMontgomery40/frigate
   - Branch: `gui-beta-clean`
   - Schema file: https://github.com/DMontgomery40/frigate/blob/gui-beta-clean/frigate/config.py
   - Contains field names, types, defaults, and minimal descriptions
   - Use this to get the complete list of fields that need documentation

3. **Example Configs**: https://github.com/blakeblackshear/frigate/tree/dev/config
   - Look at real user configurations for practical examples

## Your Output Format

Create a TypeScript/JavaScript object with this structure:

```typescript
export const FIELD_HELP: Record<string, FieldHelp> = {
  'exact.field.path': {
    description: 'DETAILED explanation here...',
    example: 'REAL example here...',
    docsUrl: 'DIRECT link to exact section',
  },

  // For fields that apply to all cameras, use wildcard:
  'cameras.*.field.name': {
    description: '...',
    example: '...',
    docsUrl: '...',
  },
};
```

## Detailed Requirements

### 1. Description Field
**Must include:**
- Plain English explanation of what it does and WHY you'd use it
- **COMPLETE list of valid values** for enums/constrained fields
  - ✅ "Valid objects: person, car, dog, cat, bicycle, motorcycle, ..." (list all 80)
  - ❌ "Common objects: person, car, dog, etc." (too vague)
- For attributes/sub-labels: List EXACTLY which attributes are valid for which objects
  - ✅ "person: [amazon, face], car: [license_plate, fedex, ups, amazon, dhl, ...], motorcycle: [license_plate]"
  - ❌ "Define sub-labels" (not helpful)
- Constraints (min/max values, format requirements)
- Common gotchas or mistakes
- When to use vs not use this field

**Format:**
- Start with one sentence explaining what it does
- Use bullet points for lists
- Use line breaks (\n\n) between sections
- Be concise but complete - think "Stack Overflow answer quality"

### 2. Example Field
**Must be:**
- A REAL, working example (not pseudo-code)
- Copy-pasteable into the config
- Show realistic values, not placeholders like "your_camera_name"
- For objects/arrays, show properly formatted JSON/YAML

**Good examples:**
```typescript
example: '{\n  "person": ["amazon", "face"],\n  "car": ["license_plate", "fedex", "ups"]\n}'

example: '["person", "car", "dog", "cat"]'

example: 'rtsp://192.168.1.100:554/stream'

example: '0,461,3,0,1919,0,1919,843,1699,492'
```

**Bad examples:**
```typescript
example: 'configure your camera here' // ❌ not actionable
example: '[objects to track]' // ❌ placeholder
example: 'see docs' // ❌ unhelpful
```

### 3. DocsUrl Field
**Must be:**
- A **DIRECT link** to the specific section that explains this field
- Use anchor links (#section-name) to jump to the right heading
- NOT just the top-level page

**Good URLs:**
```
'https://docs.frigate.video/configuration/object_detectors/#model'
'https://docs.frigate.video/configuration/zones/#zone-configuration'
'https://docs.frigate.video/configuration/cameras/#required-zones'
```

**Bad URLs:**
```
'https://docs.frigate.video/configuration/' // ❌ too general
'https://docs.frigate.video/' // ❌ homepage
'https://docs.frigate.video/configuration/cameras' // ❌ missing anchor
```

## Specific Fields to Prioritize

These fields cause the most confusion - do these FIRST:

### High Priority
1. `model.attributes_map` - List ALL valid attributes for person/car/motorcycle
2. `objects.track` - List ALL 80 COCO object labels
3. `cameras.*.objects.filters` - Explain min_area, min_score, threshold, mask
4. `cameras.*.zones` - Explain coordinate format with clear example
5. `cameras.*.motion.mask` - Same as zones
6. `cameras.*.ffmpeg.inputs` - Explain roles (detect/record) and why separate streams
7. `detectors` - Explain CPU vs Coral vs GPU with performance implications
8. `mqtt.host` - Explain Docker networking ("mqtt" vs IP address)
9. `go2rtc` - Explain stream configuration
10. `cameras.*.record.enabled` vs `cameras.*.detect.enabled` - Clarify difference

### Medium Priority
- All `*.enabled` fields - Only include if there's something non-obvious
- All `*.retain.days` fields - Explain decimal values
- All `*.threshold` fields - Explain what the number means
- FFmpeg arguments fields - Link to FFmpeg docs

### Low Priority (Skip if obvious)
- `cameras.*.name` - Skip, it's obvious
- Simple boolean toggles with clear names - Skip
- Fields with good schema descriptions already - Skip

## Research Process

For each field, follow this process:

1. **Get the field name and schema description** from the schema JSON
2. **Search Frigate docs** for mentions of this field
   - Use browser search (Ctrl+F) for the field name
   - Check related pages (cameras, detectors, objects, etc.)
3. **Find ALL possible values**:
   - Look for tables, lists, examples in docs
   - Check the schema for `enum` arrays
   - Look at example configs on GitHub
4. **Find the exact doc section** - Copy the URL with anchor
5. **Write the help entry** following the format above

## Edge Cases & Wildcards

- For camera-specific fields, use `cameras.*` wildcard:
  ```typescript
  'cameras.*.zones': { ... }  // applies to any camera
  ```

- For repeated patterns across sections:
  ```typescript
  'cameras.*.record.enabled': { description: 'Enable recording...' }
  'audio.enabled': { description: 'Enable audio detection...' }
  // Each gets its own entry with specific context
  ```

## Quality Checklist

Before submitting each help entry, verify:

- [ ] Description is in plain English a beginner could understand
- [ ] ALL valid values are listed (no "e.g." or "such as")
- [ ] Example is copy-pasteable and realistic
- [ ] Doc URL goes directly to the right section (test the link!)
- [ ] No placeholder text or TODO comments
- [ ] Grammar and spelling are correct
- [ ] Formatting uses \n\n for paragraph breaks

## Output Deliverable

Create a complete TypeScript file named `fieldHelp.ts` with the structure shown above.

**IMPORTANT: Document EVERY SINGLE FIELD in the schema that would benefit from help.**

Include:
- ✅ ALL high-priority fields (complete)
- ✅ ALL medium-priority fields (complete)
- ✅ ALL fields with enums (user needs to know valid options)
- ✅ ALL fields with complex types (objects, arrays)
- ✅ ALL fields with non-obvious constraints (min/max, patterns)
- ⚠️ SKIP ONLY: Trivially obvious fields like "name" or simple booleans with self-explanatory names

**Goal: 200-300+ help entries covering the entire Frigate configuration surface.**

The priority system is just to help you order your work - but ultimately DOCUMENT EVERYTHING.

The file should be ready to drop into:
`/Users/davidmontgomery/frigate/web/src/features/config-editor/fieldHelp.ts`

## Example of Perfect Entry

```typescript
'model.attributes_map': {
  description: 'Define which sub-labels (attributes) can be detected for each object type. Attributes are additional details about an object, like whether a person is an Amazon delivery driver or if a car has a license plate.\n\nValid attributes by object type:\n• person: amazon (delivery driver uniform), face (facial recognition)\n• car: amazon, an_post, canada_post, dhl, dpd, fedex, gls, license_plate, nzpost, postnl, postnord, purolator, royal_mail, ups, usps\n• motorcycle: license_plate\n\nOnly attributes listed here will be detected. For example, if you add "license_plate" to car, Frigate will attempt to detect and read license plates on cars.\n\nCommon mistake: Adding attributes that don\'t exist for that object type (e.g., "car" as an attribute of "person"). Each object type has a specific set of valid attributes.',
  example: '{\n  "person": ["amazon", "face"],\n  "car": ["license_plate", "fedex", "ups", "amazon"],\n  "motorcycle": ["license_plate"]\n}',
  docsUrl: 'https://docs.frigate.video/configuration/object_detectors/#attribute-labels',
},
```

## Start Your Research

Begin by:
1. Browsing https://docs.frigate.video/configuration/ - this is THE source of truth
2. Check the schema at https://github.com/DMontgomery40/frigate/blob/gui-beta-clean/frigate/config.py for the complete field list
3. Create entries for the 10 high-priority fields first
4. Then systematically work through ALL schema fields

Good luck! The goal is to make Frigate configuration accessible to people who are dyslexic or intimidated by YAML. Every field should have enough information that a user never has to leave the GUI to understand what to put there.
