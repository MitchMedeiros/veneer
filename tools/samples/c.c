#include <stdio.h>
#include "local.h"
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define STR "multi" \
            "line"

/* block comment */
typedef struct node {
    int value;
    struct node *next;
    unsigned flags : 3;
} node_t;

enum color { RED = 1, GREEN, BLUE };

static const char *names[] = { "a", "b\n", L"wide" };

// line comment
int main(int argc, char **argv) {
    char c = '\0';
    long n = 0xFFUL + 077 + 1e3 + 3.14f;
    node_t *head = NULL;
    for (int i = 0; i < argc; i++) {
        if (argv[i][0] == '-' && !head) continue;
        else printf("%s %d\n", argv[i], i);
    }
    switch (c) { case 'a': break; default: return -1; }
#ifdef DEBUG
    fprintf(stderr, "debug\n");
#endif
    return sizeof(node_t) > 4 ? 0 : 1;
}
