import { describe, expect, it } from 'vitest'
import {
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

  it('merges workspace and local declarations without duplicating symbols', () => {
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

    expect(mergedSymbols.structs.map((entry) => entry.name)).toEqual(['Actor', 'HeroActor'])
    expect(mergedSymbols.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'THIS_ACTOR', scope: 'workspace' }),
        expect.objectContaining({ name: 'self', scope: 'local' })
      ])
    )
  })
})
