import { describe, expect, it } from 'vitest'
import { parseProjectCodeSymbolIndexFromText } from '../../src/shared/codeIntelligence'
import {
  getParsedScriptPropertyDefinitions,
  getStoredScriptPropertyValue,
  validateScriptPropertyDraft
} from '../../src/shared/projectScriptProperties'

describe('projectScriptProperties', () => {
  it('extracts supported scalar and animation properties while ignoring base, arrays, and unsupported pointers', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `typedef struct {
    Actor base;
    uint8_t speed;
    WORD momentum;
    BOOLEAN active;
    Animation* idle_animation;
    uint8_t frames[4];
    Actor* target;
} Hero;
`,
      { declaredIn: 'src/CustomActors/Hero.h' }
    )

    expect(getParsedScriptPropertyDefinitions('src/CustomActors/Hero.c', symbolIndex)).toEqual([
      {
        name: 'speed',
        kind: 'integer',
        typeName: 'uint8_t',
        minimum: 0,
        maximum: 255,
        isSigned: false
      },
      {
        name: 'momentum',
        kind: 'integer',
        typeName: 'WORD',
        minimum: -32768,
        maximum: 32767,
        isSigned: true
      },
      {
        name: 'active',
        kind: 'boolean',
        typeName: 'BOOLEAN'
      },
      {
        name: 'idle_animation',
        kind: 'animation',
        typeName: 'Animation'
      }
    ])
  })

  it('extracts enum properties and keeps only valid stored enum values', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `typedef enum {
    STATE_IDLE,
    STATE_RUN
} HeroState;

typedef struct {
    HeroState state;
} Hero;
`,
      { declaredIn: 'src/CustomActors/Hero.h' }
    )

    const [state] = getParsedScriptPropertyDefinitions('src/CustomActors/Hero.c', symbolIndex)

    expect(state).toEqual({
      name: 'state',
      kind: 'enum',
      typeName: 'HeroState',
      enumValues: ['STATE_IDLE', 'STATE_RUN']
    })
    expect(getStoredScriptPropertyValue(state, { state: 'STATE_RUN' })).toBe('STATE_RUN')
    expect(getStoredScriptPropertyValue(state, { state: null })).toBeNull()
    expect(getStoredScriptPropertyValue(state, { state: 'STATE_FLY' })).toBeUndefined()
  })

  it('validates and normalizes stored values by property kind', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `typedef struct {
    UBYTE speed;
    bool active;
    Animation* idle_animation;
} Hero;
`
    )
    const [speed, active, idleAnimation] = getParsedScriptPropertyDefinitions(
      'src/CustomActors/Hero.c',
      symbolIndex
    )

    expect(getStoredScriptPropertyValue(speed, { speed: 7 })).toBe(7)
    expect(getStoredScriptPropertyValue(speed, { speed: -1 })).toBeUndefined()
    expect(getStoredScriptPropertyValue(active, { active: true })).toBe(true)
    expect(getStoredScriptPropertyValue(active, { active: 1 })).toBeUndefined()
    expect(getStoredScriptPropertyValue(idleAnimation, { idle_animation: 'Sprites/Hero.rgbsprite.json' })).toBe(
      'Sprites/Hero.rgbsprite.json'
    )
    expect(getStoredScriptPropertyValue(idleAnimation, { idle_animation: null })).toBeNull()
  })

  it('validates integer, boolean, animation, and enum drafts', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `typedef enum {
    STATE_IDLE,
    STATE_RUN
} HeroState;

typedef struct {
    uint8_t speed;
    BOOLEAN active;
    Animation* idle_animation;
    HeroState state;
} Hero;
`
    )
    const [speed, active, idleAnimation, state] = getParsedScriptPropertyDefinitions(
      'src/CustomActors/Hero.c',
      symbolIndex
    )

    expect(validateScriptPropertyDraft(speed, '42')).toEqual({
      value: 42,
      error: null
    })
    expect(validateScriptPropertyDraft(speed, '999')).toEqual({
      value: null,
      error: 'Maximum value is 255.'
    })
    expect(validateScriptPropertyDraft(active, true)).toEqual({
      value: true,
      error: null
    })
    expect(validateScriptPropertyDraft(idleAnimation, null)).toEqual({
      value: null,
      error: null
    })
    expect(validateScriptPropertyDraft(state, 'STATE_RUN')).toEqual({
      value: 'STATE_RUN',
      error: null
    })
    expect(validateScriptPropertyDraft(state, null)).toEqual({
      value: null,
      error: null
    })
    expect(validateScriptPropertyDraft(state, 'STATE_FLY')).toEqual({
      value: null,
      error: 'Choose one of the available values.'
    })
  })
})
