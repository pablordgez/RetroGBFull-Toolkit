---
sidebar_position: 6
title: Persistence and Interrupts
---


## `SaveData.h`

Header: `core/src/Saves/SaveData.h`

### `SaveData`

| Field | Type | Meaning |
| --- | --- | --- |
| `signature` | `uint8_t[4]` | Save validity marker. Defaults to `SAVE`. |

The struct also includes generated project save variables.

### Globals

| Name | Type | Meaning |
| --- | --- | --- |
| `save_data` | `SaveData` | In-memory save data. |

### Functions

| Function | Description |
| --- | --- |
| `void save_save_data(void);` | Writes the current `save_data` record to SRAM. |

## `InterruptManager.h`

Header: `core/src/Interrupts/InterruptManager.h`

### Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `INTERRUPT_MANAGER_MAX_CALLBACKS` | `8U` | Maximum VBlank, timer, or serial callbacks. |
| `INTERRUPT_MANAGER_MAX_LCD_EVENTS` | `8U` | Maximum LCD scanline events. |
| `INTERRUPT_TIMER_4KHZ` | `TACF_4KHZ` | Timer clock-select constant. |
| `INTERRUPT_TIMER_16KHZ` | `TACF_16KHZ` | Timer clock-select constant. |
| `INTERRUPT_TIMER_65KHZ` | `TACF_65KHZ` | Timer clock-select constant. |
| `INTERRUPT_TIMER_262KHZ` | `TACF_262KHZ` | Timer clock-select constant. |

### Types

| Type | Meaning |
| --- | --- |
| `InterruptCallback` | `void (*)(void)` |

### `LcdScanlineInterrupt`

| Field | Type | Meaning |
| --- | --- | --- |
| `ly` | `uint8_t` | Scanline for the interrupt. |
| `callback` | `InterruptCallback` | Callback to run at that scanline. |

### Functions

| Function | Description |
| --- | --- |
| `uint8_t add_vblank_interrupt_callback(InterruptCallback callback) BANKED;` | Adds a VBlank callback if it is non-null and not already registered. |
| `uint8_t remove_vblank_interrupt_callback(InterruptCallback callback) BANKED;` | Removes a VBlank callback. |
| `void clear_vblank_interrupt_callbacks(void) BANKED;` | Removes every VBlank callback. |
| `void set_vblank_interrupt_callback(InterruptCallback callback) BANKED;` | Replaces VBlank callbacks with one callback. |
| `uint8_t add_serial_interrupt_callback(InterruptCallback callback) BANKED;` | Adds a serial interrupt callback. |
| `uint8_t remove_serial_interrupt_callback(InterruptCallback callback) BANKED;` | Removes a serial interrupt callback. |
| `void clear_serial_interrupt_callbacks(void) BANKED;` | Clears serial callbacks. |
| `void set_serial_interrupt_callback(InterruptCallback callback) BANKED;` | Replaces serial callbacks with one callback. |
| `uint8_t add_timer_interrupt_callback(InterruptCallback callback) BANKED;` | Adds a timer interrupt callback. |
| `uint8_t remove_timer_interrupt_callback(InterruptCallback callback) BANKED;` | Removes a timer interrupt callback. |
| `void clear_timer_interrupt_callbacks(void) BANKED;` | Clears timer callbacks. |
| `void set_timer_interrupt_callback(uint8_t clock_select, uint8_t modulo, InterruptCallback callback) BANKED;` | Configures the timer and installs one callback. |
| `void clear_lcd_scanline_interrupts(void) BANKED;` | Clears all scheduled LCD scanline events. |
| `uint8_t add_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED;` | Adds one LCD scanline event. |
| `uint8_t remove_lcd_scanline_interrupt(uint8_t ly, InterruptCallback callback) BANKED;` | Removes one LCD scanline event. |
| `void clear_lcd_scanline_interrupts_for_callback(InterruptCallback callback) BANKED;` | Removes every LCD scanline event using the given callback. |

### Behavior notes

- Duplicate callbacks are ignored and reported as success (you can add more than one callback to an interrupt but not the same one).
- LCD scanline events are ordered by `ly` and multiple callbacks can share the same scanline.

## `TimerInterrupt.h`

Header: `core/src/Interrupts/TimerInterrupt.h`

### Functions

| Function | Description |
| --- | --- |
| `void init_timer_interrupt(uint16_t frequency_hz, InterruptCallback callback) BANKED;` | Starts a timer callback at the requested frequency. Passing `0` or `NULL` disables the timer. |
| `void stop_timer_interrupt(void) BANKED;` | Stops timer interrupts. |

## `SerialLink.h`

Header: `core/src/Interrupts/SerialLink.h`

### Functions

| Function | Description |
| --- | --- |
| `void init_serial_link(uint8_t is_master) BANKED;` | Initializes serial state and callbacks. |
| `void shutdown_serial_link(void) BANKED;` | Stops transfers and unregisters serial-related callbacks. |
| `void send_serial_link_byte(uint8_t data) BANKED;` | Starts a transfer when the link is idle. |
| `uint8_t serial_link_ready(void) BANKED;` | Returns nonzero when no transfer is in progress. |
| `uint8_t serial_link_has_error(void) BANKED;` | Returns nonzero when the last transfer timed out. |
| `uint8_t get_serial_link_byte(void) BANKED;` | Returns the most recently received byte. |

### Behavior notes

- Serial transfers time out after more than 10 VBlank ticks.
- Master mode sends with `SC_REG = 0x81`; slave mode uses `0x80`.
