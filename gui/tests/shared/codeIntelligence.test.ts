import { describe, expect, it } from 'vitest'
import {
  computeProjectCodeDiagnostics,
  getActiveFunctionCall,
  getStructFieldsForExpression,
  mergeProjectCodeSymbolIndexes,
  parseProjectCodeSymbolIndexFromText
} from '../../src/shared/codeIntelligence'

describe('codeIntelligence', () => {
  it('extracts structs, enums, functions, macros, and extern variables from C code', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `#define MAX_SPEED 4
extern Actor* THIS_ACTOR;

typedef struct {
    Actor base;
    uint8_t speed;
} HeroActor;

typedef enum {
    STATE_IDLE,
    STATE_RUN = 3
} HeroState;

void AINIT(void);
`,
      { declaredIn: 'src/CustomActors/HeroActor.h' }
    )

    expect(symbolIndex.structs).toEqual([
      {
        name: 'HeroActor',
        declaredIn: 'src/CustomActors/HeroActor.h',
        fields: [
          {
            name: 'base',
            type: {
              name: 'Actor',
              pointerDepth: 0
            },
            isArray: false
          },
          {
            name: 'speed',
            type: {
              name: 'uint8_t',
              pointerDepth: 0
            },
            isArray: false
          }
        ]
      }
    ])
    expect(symbolIndex.enums[0]?.values).toEqual(['STATE_IDLE', 'STATE_RUN'])
    expect(symbolIndex.functions[0]?.name).toBe('AINIT')
    expect(symbolIndex.macros[0]?.name).toBe('MAX_SPEED')
    expect(symbolIndex.variables[0]).toMatchObject({
      name: 'THIS_ACTOR',
      scope: 'workspace',
      type: {
        name: 'Actor',
        pointerDepth: 1
      }
    })
  })

  it('expands macro-generated enum registries into suggestion values', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(`#define ANIMATIONS \\
    _ANIMATION(hero_idle, 8, 8, 1, 60, (void*) 0) \\
    _ANIMATION(hero_run, 16, 16, 4, 10, hero_run_metasprite)

#define _ANIMATION(name, width, height, frames, duration, metasprite) name,
typedef enum {
    ANIMATIONS
    NUMBER_OF_ANIMATIONS
} AnimationType;
`)

    expect(symbolIndex.enums).toEqual([
      {
        name: 'AnimationType',
        declaredIn: undefined,
        values: ['hero_idle', 'hero_run', 'NUMBER_OF_ANIMATIONS']
      }
    ])
  })

  it('uses workspace and local declarations to resolve struct member suggestions', () => {
    const workspaceSymbols = parseProjectCodeSymbolIndexFromText(
      `typedef struct {
    uint8_t x;
    uint8_t y;
} Actor;

extern Actor* THIS_ACTOR;
`,
      { declaredIn: 'src/Actor/Actor.h' }
    )
    const localSymbols = parseProjectCodeSymbolIndexFromText(
      `typedef struct {
    Actor base;
    uint8_t speed;
} HeroActor;

void AINIT(void){
    HeroActor* self = (HeroActor*) THIS_ACTOR;
}
`,
      {
        declaredIn: 'src/CustomActors/HeroActor.c',
        includeLocalVariables: true
      }
    )
    const mergedSymbols = mergeProjectCodeSymbolIndexes([workspaceSymbols, localSymbols])

    expect(getStructFieldsForExpression('self', mergedSymbols).map((field) => field.name)).toEqual([
      'base',
      'speed'
    ])
    expect(
      getStructFieldsForExpression('self->base', mergedSymbols).map((field) => field.name)
    ).toEqual(['x', 'y'])
  })

  it('reports diagnostics for multi-character literals and unclosed delimiters', () => {
    const diagnostics = computeProjectCodeDiagnostics(`int test = 'ahauosdhuiahsdi';\nif (test > 0) {\n`)

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Character literals should contain a single character.'
        }),
        expect.objectContaining({
          message: 'Missing closing delimiter for "{".'
        })
      ])
    )
  })

  it('reports obvious initializer mismatches for strings and address expressions', () => {
    const diagnostics = computeProjectCodeDiagnostics(`int score = "oops";\nuint8_t speed = &hero;\n`)

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Cannot initialize int with a string literal.'
        }),
        expect.objectContaining({
          message: 'Cannot initialize non-pointer uint8_t with an address expression.'
        })
      ])
    )
  })

  it('detects the active function call and parameter index near the cursor', () => {
    expect(getActiveFunctionCall('set_actor_position(hero->x, ')).toEqual({
      functionName: 'set_actor_position',
      activeParameterIndex: 1
    })

    expect(getActiveFunctionCall('outer(inner(value, 2), hero')).toEqual({
      functionName: 'outer',
      activeParameterIndex: 1
    })

    expect(getActiveFunctionCall('if (hero->x > 4)')).toBeNull()
  })
})
