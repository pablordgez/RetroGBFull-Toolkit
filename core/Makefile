ifndef GBDK_HOME
    GBDK_HOME = ../gbdk
endif

LCC = $(GBDK_HOME)/bin/lcc 
GBDK_ROM_BANKING = ON

ifdef GBDK_DEBUG
    LCCFLAGS += -debug -v
endif
ifdef GBDK_ROM_BANKING
    LCCFLAGS += -Wl-yt0x1B
    LCCFLAGS += -Wm-ya4
    LCCFLAGS += -autobank
endif

PROJECTNAME    = Example

SRCDIR      = src
OBJDIR      = obj
RESDIR      = res
BINS        = $(OBJDIR)/$(PROJECTNAME).gb


ifeq ($(OS),Windows_NT)
    # Windows specific settings
    # Function to swap / for \ in paths
    FIXPATH = $(subst /,\,$(1))
    # Create directory only if it doesn't exist (prevents errors)
    MKDIR   = if not exist $(call FIXPATH,$(1)) mkdir $(call FIXPATH,$(1))
    # Recursively remove directory
    RM      = rmdir /S /Q
else
    # Linux/macOS specific settings
    FIXPATH = $(1)
    MKDIR   = mkdir -p $(1)
    RM      = rm -rf
endif


# Recursive wildcard function
rwildcard=$(foreach d,$(wildcard $(1:=/*)),$(call rwildcard,$d,$2) $(filter $(subst *,%,$2),$d))

CSOURCES    = $(call rwildcard, $(SRCDIR), *.c) $(call rwildcard, $(RESDIR), *.c)
ASMSOURCES  = $(call rwildcard, $(SRCDIR), *.s)
OBJS        = $(CSOURCES:%.c=$(OBJDIR)/%.o) $(ASMSOURCES:%.s=$(OBJDIR)/%.o)

all:    prepare $(BINS)

debug:
	@$(MAKE) GBDK_DEBUG=1

# Modified rule to include FILE_NAME definition
$(OBJDIR)/%.o:  %.c
	@$(call MKDIR,$(@D))
	$(LCC) $(LCCFLAGS) -DFILE_NAME=$(basename $(notdir $<)) -c -o $@ $<

$(OBJDIR)/%.o:  %.s
	@$(call MKDIR,$(@D))
	$(LCC) $(LCCFLAGS) -c -o $@ $<

# Modified rule to include FILE_NAME definition (for assembly generation)
$(OBJDIR)/%.s:  %.c
	@$(call MKDIR,$(@D))
	$(LCC) $(LCCFLAGS) -DFILE_NAME=$(basename $(notdir $<)) -S -o $@ $<

# Link
$(BINS):    $(OBJS)
	$(LCC) $(LCCFLAGS) -o $(BINS) $(OBJS)

prepare:
	@$(call MKDIR,$(OBJDIR))

clean:
ifneq ($(strip $(OBJDIR)),)
ifneq ($(strip $(OBJDIR)),/)
ifneq ($(strip $(OBJDIR)),.)
	$(RM) $(call FIXPATH,$(OBJDIR))
else
	@echo "Error: OBJDIR is set to current directory (.). Aborting clean."
endif
else
	@echo "Error: OBJDIR is set to root (/). Aborting clean."
endif
else
	@echo "Error: OBJDIR is undefined or empty. Aborting clean."
endif