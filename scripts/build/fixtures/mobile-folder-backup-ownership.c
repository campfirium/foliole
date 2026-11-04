#include "mobile-folder-backup-fixture.h"
#include "mobile-folder-backup-io.h"

void fixture_ownership(Fixture *fixture, const char *target, int unknown) {
    fixture_initialize(fixture);
    if (!unknown) fixture_successful_copy(fixture, target);
    sqlite3 *external = openDatabase(target, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE);
    if (unknown) execute(external, "CREATE TABLE facts(value TEXT);INSERT INTO facts VALUES('external')");
    else execute(external, "UPDATE facts SET value='external'");
    sqlite3_close(external);
    FolioleBackupResult result = fixture_copy(fixture, target);
    require(result.code != SQLITE_OK && !result.committed, "Unrecognized target was overwritten");
    verifyTarget(target, "SELECT count(*) FROM facts WHERE value='external'", 1);
    require(fixture_io_main_bytes() == 0, "Rejected target received page writes");
    puts("{\"passed\":true,\"externalFactsRetained\":true,\"targetWrites\":0}");
}
