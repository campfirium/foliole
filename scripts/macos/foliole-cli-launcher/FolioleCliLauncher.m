#import <Foundation/Foundation.h>

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static NSString *const kAgentControlGroup = @"V589TQH334.group.com.campfirium.foliole.agent-control";

static int fail(NSString *code) {
  fprintf(stderr, "{\"error\":\"%s\"}\n", code.UTF8String ?: "cli_launch_failed");
  return 3;
}

static NSString *resolveCliContentsDirectory(void) {
  NSURL *bundleUrl = NSBundle.mainBundle.bundleURL;
  if (bundleUrl == nil) return nil;
  return [bundleUrl URLByAppendingPathComponent:@"Contents"].path;
}

static BOOL configureRuntimeEnvironment(NSString *cliContentsDirectory) {
  NSFileManager *files = NSFileManager.defaultManager;
  NSURL *groupUrl = [files containerURLForSecurityApplicationGroupIdentifier:kAgentControlGroup];
  if (groupUrl == nil) return NO;
  NSURL *supportUrl = [files URLForDirectory:NSApplicationSupportDirectory
                                    inDomain:NSUserDomainMask
                           appropriateForURL:nil
                                      create:YES
                                       error:nil];
  if (supportUrl == nil) return NO;
  NSString *descriptor = [groupUrl URLByAppendingPathComponent:@"agent-control-session.json"].path;
  NSString *backup = [[supportUrl URLByAppendingPathComponent:@"Foliole CLI"]
    URLByAppendingPathComponent:@"backups"].path;
  NSString *metadata = [cliContentsDirectory stringByAppendingPathComponent:@"Resources/package.json"];
  NSString *agentScript = [cliContentsDirectory
    stringByAppendingPathComponent:@"Resources/scripts/agent-control/foliole-agent.mjs"];
  setenv("FOLIOLE_AGENT_DESCRIPTOR", descriptor.fileSystemRepresentation, 1);
  setenv("FOLIOLE_AGENT_BACKUP_DIR", backup.fileSystemRepresentation, 1);
  setenv("FOLIOLE_AGENT_SCRIPT", agentScript.fileSystemRepresentation, 1);
  setenv("FOLIOLE_PRODUCT_METADATA_PATH", metadata.fileSystemRepresentation, 1);
  return YES;
}

static int launchRuntime(int argc, const char *argv[], NSString *runtimePath) {
  char **runtimeArgv = calloc((size_t)argc + 1, sizeof(char *));
  if (runtimeArgv == NULL) return fail(@"cli_launch_failed");
  runtimeArgv[0] = (char *)runtimePath.fileSystemRepresentation;
  for (int index = 1; index < argc; index += 1) runtimeArgv[index] = (char *)argv[index];
  runtimeArgv[argc] = NULL;
  execv(runtimePath.fileSystemRepresentation, runtimeArgv);
  free(runtimeArgv);
  return fail(errno == ENOENT ? @"cli_runtime_missing" : @"cli_launch_failed");
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *cliContentsDirectory = resolveCliContentsDirectory();
    if (cliContentsDirectory.length == 0) return fail(@"cli_location_unavailable");
    if (!configureRuntimeEnvironment(cliContentsDirectory)) return fail(@"cli_container_unavailable");
    NSString *runtimePath = [cliContentsDirectory stringByAppendingPathComponent:@"MacOS/foliole-runtime"];
    return launchRuntime(argc, argv, runtimePath);
  }
}
