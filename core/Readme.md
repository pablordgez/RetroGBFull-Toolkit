The Makefile will automatically detect and compile new source files
when they are added to the "src" and "res" directories or their subdirectories.

Project directories
  - src: Main program source files (.c, .h, .s) can go here
  - res: Program graphics and audio source files (.c, .h, .s) can go here
  - obj: Compiled ROM (.gb) and debug files go in this directory

Commands:
- make clean: clean obj before compiling
- make debug: compile with debug symbols (also cleans)
