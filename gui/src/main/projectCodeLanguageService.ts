import { readFile } from 'fs/promises'
import { relative, resolve } from 'path'
import {
  PROJECT_CODE_WORKSPACE_ROOT,
  PROJECT_CODE_WORKSPACE_STUB_ROOT,
  toProjectCodeWorkspacePath,
  type ProjectCodeWorkspaceSnapshot
} from '../shared/projectCodeWorkspace'
import { ensureProjectDirectory, walkProjectCodeFiles } from './projectCodeFiles'

const CODE_WORKSPACE_DIRECTORIES = ['src', 'res']

// stubs for clangd, to provide a virtual include directory with all the necessary headers
const buildStdintHeader = (): string => `#ifndef RETROGBFULL_STUB_STDINT_H
#define RETROGBFULL_STUB_STDINT_H
typedef signed char int8_t;
typedef unsigned char uint8_t;
typedef short int16_t;
typedef unsigned short uint16_t;
typedef int int32_t;
typedef unsigned int uint32_t;
typedef long long int64_t;
typedef unsigned long long uint64_t;
typedef signed char intptr_t;
typedef unsigned char uintptr_t;
#endif /* RETROGBFULL_STUB_STDINT_H */
`

const buildStdboolHeader = (): string => `#ifndef RETROGBFULL_STUB_STDBOOL_H
#define RETROGBFULL_STUB_STDBOOL_H
#define bool _Bool
#define true 1
#define false 0
#endif /* RETROGBFULL_STUB_STDBOOL_H */
`

const buildStddefHeader = (): string => `#ifndef RETROGBFULL_STUB_STDDEF_H
#define RETROGBFULL_STUB_STDDEF_H
typedef unsigned int size_t;
#define NULL ((void*)0)
#endif /* RETROGBFULL_STUB_STDDEF_H */
`

const buildStdlibHeader = (): string => `#ifndef RETROGBFULL_STUB_STDLIB_H
#define RETROGBFULL_STUB_STDLIB_H
#include <stddef.h>
void* malloc(size_t size);
void free(void* ptr);
void* calloc(size_t count, size_t size);
void* realloc(void* ptr, size_t size);
int rand(void);
void srand(unsigned int seed);
#endif /* RETROGBFULL_STUB_STDLIB_H */
`

const buildStdioHeader = (): string => `#ifndef RETROGBFULL_STUB_STDIO_H
#define RETROGBFULL_STUB_STDIO_H
int printf(const char* format, ...);
int sprintf(char* buffer, const char* format, ...);
int snprintf(char* buffer, unsigned int size, const char* format, ...);
#endif /* RETROGBFULL_STUB_STDIO_H */
`

const buildStringHeader = (): string => `#ifndef RETROGBFULL_STUB_STRING_H
#define RETROGBFULL_STUB_STRING_H
#include <stddef.h>
void* memcpy(void* destination, const void* source, size_t count);
void* memmove(void* destination, const void* source, size_t count);
void* memset(void* destination, int value, size_t count);
int memcmp(const void* left, const void* right, size_t count);
char* strcpy(char* destination, const char* source);
char* strncpy(char* destination, const char* source, size_t count);
size_t strlen(const char* value);
int strcmp(const char* left, const char* right);
int strncmp(const char* left, const char* right, size_t count);
#endif /* RETROGBFULL_STUB_STRING_H */
`

const buildGbHeader = (): string => `#ifndef RETROGBFULL_STUB_GB_GB_H
#define RETROGBFULL_STUB_GB_GB_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef uint8_t UBYTE;
typedef int8_t BYTE;
typedef uint16_t UWORD;
typedef int16_t WORD;
typedef uint8_t BOOLEAN;
typedef uint32_t FAR_PTR;

#define TRUE 1
#define FALSE 0

#define BANKED
#define NONBANKED
#define CRITICAL
#define BANKREF(name) extern const void* name
#define BANKREF_EXTERN(name) extern const void* name
#define BANK(name) 0
#define TO_FAR_PTR(ofs, seg) ((FAR_PTR)0)
#define FAR_CALL(ptr, typ, ...) ((typ)0)
#define SWITCH_ROM(bank) ((void)(bank))

#define DISPLAY_ON ((void)0)
#define SHOW_WIN ((void)0)
#define HIDE_WIN ((void)0)
#define SHOW_BKG ((void)0)
#define SHOW_SPRITES ((void)0)

#define LCD_IFLAG 0x02
#define VBL_IFLAG 0x01
#define TIM_IFLAG 0x04
#define SIO_IFLAG 0x08

#define STATF_LYC 0x40

#define J_A 0x01
#define J_B 0x02
#define J_SELECT 0x04
#define J_START 0x08
#define J_RIGHT 0x10
#define J_LEFT 0x20
#define J_UP 0x40
#define J_DOWN 0x80

#define TACF_STOP 0x00
#define TACF_START 0x04
#define TACF_4KHZ 0x00
#define TACF_16KHZ 0x01
#define TACF_65KHZ 0x02
#define TACF_262KHZ 0x03

#define SCREEN_WIDTH 160
#define SCREEN_HEIGHT 144

extern volatile uint8_t IE_REG;
extern volatile uint8_t IF_REG;
extern volatile uint8_t WY_REG;
extern volatile uint8_t LYC_REG;
extern volatile uint8_t STAT_REG;
extern volatile uint8_t SB_REG;
extern volatile uint8_t SC_REG;
extern volatile uint8_t TAC_REG;
extern volatile uint8_t TMA_REG;
extern volatile uint8_t TIMA_REG;
extern volatile uint8_t NR11_REG;
extern volatile uint8_t NR12_REG;
extern volatile uint8_t NR13_REG;
extern volatile uint8_t NR14_REG;
extern volatile uint8_t NR21_REG;
extern volatile uint8_t NR22_REG;
extern volatile uint8_t NR23_REG;
extern volatile uint8_t NR24_REG;
extern volatile uint8_t NR32_REG;
extern volatile uint8_t NR41_REG;
extern volatile uint8_t NR42_REG;
extern volatile uint8_t NR43_REG;
extern volatile uint8_t NR44_REG;
extern volatile uint8_t NR50_REG;
extern volatile uint8_t NR51_REG;
extern volatile uint8_t NR52_REG;

uint8_t joypad(void);
uint8_t waitpad(uint8_t mask);
void waitpadup(void);
void wait_vbl_done(void);
void display_off(void);
void delay(uint16_t duration);
void disable_interrupts(void);
void enable_interrupts(void);
void set_interrupts(uint8_t flags);
void add_LCD(uint8_t line, void (*callback)(void));
void remove_LCD(uint8_t line, void (*callback)(void));
void add_VBL(void (*callback)(void));
void remove_VBL(void (*callback)(void));
void add_TIM(void (*callback)(void));
void remove_TIM(void (*callback)(void));
void set_bkg_data(uint8_t first_tile, uint8_t nb_tiles, const void* data);
void set_win_data(uint8_t first_tile, uint8_t nb_tiles, const void* data);
void set_sprite_data(uint8_t first_tile, uint8_t nb_tiles, const void* data);
void set_bkg_tiles(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const void* tiles);
void set_win_tiles(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const void* tiles);
void get_bkg_tiles(uint8_t x, uint8_t y, uint8_t width, uint8_t height, void* tiles);
void get_win_tiles(uint8_t x, uint8_t y, uint8_t width, uint8_t height, void* tiles);
void set_bkg_based_submap(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const void* map, uint8_t map_width, const void* tileset, uint8_t tiles);
void set_win_based_submap(uint8_t x, uint8_t y, uint8_t width, uint8_t height, const void* map, uint8_t map_width, const void* tileset, uint8_t tiles);
void set_bkg_1bpp_data(uint8_t first_tile, uint8_t nb_tiles, const void* data);
void set_1bpp_colors(uint8_t foreground, uint8_t background);
void set_vram_byte(uint8_t* address, uint8_t value);
void move_bkg(uint8_t x, uint8_t y);
void move_win(uint8_t x, uint8_t y);
void move_sprite(uint8_t index, uint8_t x, uint8_t y);
void hide_sprite(uint8_t index);
void set_sprite_tile(uint8_t index, uint8_t tile);
void set_sprite_prop(uint8_t index, uint8_t properties);

#ifdef __cplusplus
}
#endif
#endif /* RETROGBFULL_STUB_GB_GB_H */
`

const buildMetaspritesHeader = (): string => `#ifndef RETROGBFULL_STUB_GB_METASPRITES_H
#define RETROGBFULL_STUB_GB_METASPRITES_H
#include <stdint.h>
typedef struct metasprite_t {
    int8_t dy;
    int8_t dx;
    uint8_t dtile;
    uint8_t props;
} metasprite_t;
uint8_t move_metasprite_ex(const metasprite_t* metasprite, uint8_t base_tile, uint8_t base_prop, uint8_t base_sprite, uint8_t x, uint8_t y);
uint8_t move_metasprite(const metasprite_t* metasprite, uint8_t base_tile, uint8_t base_sprite, uint8_t x, uint8_t y);
void hide_metasprite(const metasprite_t* metasprite, uint8_t base_sprite);
#endif /* RETROGBFULL_STUB_GB_METASPRITES_H */
`

const STUB_FILES = [
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/stdint.h`,
    content: buildStdintHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/stdbool.h`,
    content: buildStdboolHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/stddef.h`,
    content: buildStddefHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/stdlib.h`,
    content: buildStdlibHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/stdio.h`,
    content: buildStdioHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/string.h`,
    content: buildStringHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gb/gb.h`,
    content: buildGbHeader()
  },
  {
    path: `${PROJECT_CODE_WORKSPACE_STUB_ROOT}/gb/metasprites.h`,
    content: buildMetaspritesHeader()
  }
] as const

// for each source/header, builds a compile command entry for clangd
const buildCompileCommandsFile = (workspacePaths: string[]): string => {
  const entries = workspacePaths.map((workspacePath) => ({
    directory: PROJECT_CODE_WORKSPACE_ROOT,
    file: workspacePath,
    arguments: [
      'clang',
      '-x',
      workspacePath.endsWith('.h') ? 'c-header' : 'c',
      '-std=c11',
      `-I${PROJECT_CODE_WORKSPACE_ROOT}/src`,
      `-I${PROJECT_CODE_WORKSPACE_ROOT}/res`,
      `-I${PROJECT_CODE_WORKSPACE_STUB_ROOT}`,
      '-D__attribute__(x)=',
      workspacePath
    ]
  }))

  return `${JSON.stringify(entries, null, 2)}\n`
}

const buildClangdConfig = (): string => `CompileFlags:
  Add:
    - -std=c11
    - -I${PROJECT_CODE_WORKSPACE_ROOT}/src
    - -I${PROJECT_CODE_WORKSPACE_ROOT}/res
    - -I${PROJECT_CODE_WORKSPACE_STUB_ROOT}
    - -D__attribute__(x)=
`

export const getProjectCodeWorkspaceSnapshot = async (
  projectPath: string
): Promise<ProjectCodeWorkspaceSnapshot> => {
  const normalizedProjectPath = await ensureProjectDirectory(projectPath)
  const files: ProjectCodeWorkspaceSnapshot['files'] = []
  const workspacePaths: string[] = []

  for (const directoryName of CODE_WORKSPACE_DIRECTORIES) {
    const absoluteDirectoryPath = resolve(normalizedProjectPath, directoryName)

    try {
      const discoveredPaths = await walkProjectCodeFiles(absoluteDirectoryPath)
      // iterates code files
      for (const discoveredPath of discoveredPaths) {
        const absoluteFilePath = resolve(absoluteDirectoryPath, discoveredPath)
        const relativePath = relative(normalizedProjectPath, absoluteFilePath).replace(/\\/g, '/')
        // converts project path to virtual workspace path (src/main.c -> /workspace/src/main.c)
        const workspacePath = toProjectCodeWorkspacePath(relativePath)
        const content = await readFile(absoluteFilePath, 'utf-8')

        files.push({
          path: workspacePath,
          content
        })
        workspacePaths.push(workspacePath)
      }
    } catch (error) {
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: string }).code)
          : ''

      if (errorCode !== 'ENOENT') {
        throw error
      }
    }
  }

  // adds compile commands, clangd config and stubs to the workspace files
  files.push(
    {
      path: `${PROJECT_CODE_WORKSPACE_ROOT}/compile_commands.json`,
      content: buildCompileCommandsFile(workspacePaths)
    },
    {
      path: `${PROJECT_CODE_WORKSPACE_ROOT}/.clangd`,
      content: buildClangdConfig()
    },
    ...STUB_FILES
  )

  return {
    workspaceRoot: PROJECT_CODE_WORKSPACE_ROOT,
    files,
    sourceFileCount: workspacePaths.length
  }
}
