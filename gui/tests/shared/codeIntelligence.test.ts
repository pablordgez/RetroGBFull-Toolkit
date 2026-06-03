import { describe, expect, it } from 'vitest'
import {
  createEmptyProjectCodeSymbolIndex,
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

  it('ignores comments, keeps comment-like text inside strings, and parses typedef aliases', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `// typedef struct { int fake; } Fake;
/* extern uint8_t COMMENTED_OUT; */
#define LABEL "/* keep this string */"

typedef unsigned char UBYTE;
typedef UBYTE* BytePtr;

void log_label(void) {
  const char* text = "// still part of a string";
}
`,
      { declaredIn: 'src/Scripts/Test.c' }
    )

    expect(symbolIndex.structs).toEqual([])
    expect(symbolIndex.variables).toEqual([])
    expect(symbolIndex.typeAliases).toEqual([
      {
        name: 'UBYTE',
        declaredIn: 'src/Scripts/Test.c',
        targetType: {
          name: 'char',
          pointerDepth: 0
        }
      },
      {
        name: 'BytePtr',
        declaredIn: 'src/Scripts/Test.c',
        targetType: {
          name: 'UBYTE',
          pointerDepth: 1
        }
      }
    ])
    expect(symbolIndex.macros).toEqual([
      {
        name: 'LABEL',
        declaredIn: 'src/Scripts/Test.c',
        value: '"/* keep this string */"'
      }
    ])
    expect(symbolIndex.functions.map((entry) => entry.name)).toEqual(['log_label'])
  })

  it('parses function signatures, extern arrays, local variables, and parameters from richer C declarations', () => {
    const symbolIndex = parseProjectCodeSymbolIndexFromText(
      `extern const unsigned char actor_palette[];
extern BANKED Actor* THIS_ACTOR;

void update_actor(const Hero* hero, uint8_t stepCount) BANKED;
static inline UWORD compute_total(UWORD left, UWORD right) NONBANKED {
  UWORD total = left + right;
  uint8_t row = 0, column = 1;
  if (row < column) {
    UBYTE* cursor = 0;
  }
  return total;
}
`,
      {
        declaredIn: 'src/CustomActors/Hero.c',
        includeLocalVariables: true
      }
    )

    expect(symbolIndex.variables).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'actor_palette',
          scope: 'workspace',
          type: { name: 'char', pointerDepth: 0 }
        }),
        expect.objectContaining({
          name: 'THIS_ACTOR',
          scope: 'workspace',
          type: { name: 'Actor', pointerDepth: 1 }
        }),
        expect.objectContaining({
          name: 'hero',
          scope: 'parameter',
          type: { name: 'Hero', pointerDepth: 1 }
        }),
        expect.objectContaining({
          name: 'stepCount',
          scope: 'parameter',
          type: { name: 'uint8_t', pointerDepth: 0 }
        }),
        expect.objectContaining({
          name: 'total',
          scope: 'local',
          type: { name: 'UWORD', pointerDepth: 0 }
        }),
        expect.objectContaining({
          name: 'row',
          scope: 'local',
          type: { name: 'uint8_t', pointerDepth: 0 }
        }),
        expect.objectContaining({
          name: 'column',
          scope: 'local',
          type: { name: 'uint8_t', pointerDepth: 0 }
        }),
        expect.objectContaining({
          name: 'cursor',
          scope: 'local',
          type: { name: 'UBYTE', pointerDepth: 1 }
        })
      ])
    )
    expect(symbolIndex.functions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'update_actor',
          returnType: { name: 'void', pointerDepth: 0 },
          parameters: [
            {
              name: 'hero',
              type: { name: 'Hero', pointerDepth: 1 }
            },
            {
              name: 'stepCount',
              type: { name: 'uint8_t', pointerDepth: 0 }
            }
          ]
        }),
        expect.objectContaining({
          name: 'compute_total',
          returnType: { name: 'UWORD', pointerDepth: 0 }
        })
      ])
    )
  })

  it('creates an empty symbol index and merges duplicate structs, enums, and source counts', () => {
    const emptyIndex = createEmptyProjectCodeSymbolIndex()

    expect(emptyIndex).toEqual({
      structs: [],
      enums: [],
      functions: [],
      variables: [],
      macros: [],
      typeAliases: [],
      sourceFilesScanned: 0
    })

    const mergedSymbols = mergeProjectCodeSymbolIndexes([
      {
        structs: [
          {
            name: 'Hero',
            declaredIn: 'Hero.h',
            fields: [{ name: 'speed', type: { name: 'uint8_t', pointerDepth: 0 }, isArray: false }]
          }
        ],
        enums: [
          {
            name: 'HeroState',
            declaredIn: 'Hero.h',
            values: ['STATE_IDLE']
          }
        ],
        functions: [],
        variables: [],
        macros: [],
        typeAliases: [],
        sourceFilesScanned: 2
      },
      {
        structs: [
          {
            name: 'Hero',
            declaredIn: undefined,
            fields: [
              { name: 'speed', type: { name: 'uint8_t', pointerDepth: 0 }, isArray: false },
              { name: 'health', type: { name: 'uint8_t', pointerDepth: 0 }, isArray: false }
            ]
          }
        ],
        enums: [
          {
            name: 'HeroState',
            declaredIn: undefined,
            values: ['STATE_IDLE', 'STATE_RUN']
          }
        ],
        functions: [],
        variables: [],
        macros: [],
        typeAliases: [],
        sourceFilesScanned: 3
      }
    ])

    expect(mergedSymbols.structs).toEqual([
      {
        name: 'Hero',
        declaredIn: 'Hero.h',
        fields: [
          { name: 'speed', type: { name: 'uint8_t', pointerDepth: 0 }, isArray: false },
          { name: 'health', type: { name: 'uint8_t', pointerDepth: 0 }, isArray: false }
        ]
      }
    ])
    expect(mergedSymbols.enums).toEqual([
      {
        name: 'HeroState',
        declaredIn: 'Hero.h',
        values: ['STATE_IDLE', 'STATE_RUN']
      }
    ])
    expect(mergedSymbols.sourceFilesScanned).toBe(5)
  })
})
