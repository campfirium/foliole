#ifndef FOLIOLE_BACKUP_IO_FIXTURE_H
#define FOLIOLE_BACKUP_IO_FIXTURE_H

#include <stdint.h>

char *fixture_io_uri(const char *path);
void fixture_io_reset(int fault, void (*beforeWrite)(void *), void *context);
uint64_t fixture_io_main_bytes(void);
uint64_t fixture_io_journal_bytes(void);

#endif
