#include <stdio.h>
#include <stdlib.h>
#include "utils.h"

typedef struct {
    int id;
    char name[64];
    float score;
} Student;

enum Color {
    RED,
    GREEN,
    BLUE
};

void print_student(const Student *s) {
    printf("Student: %s (ID: %d, Score: %.1f)\n", s->name, s->id, s->score);
}

Student *create_student(int id, const char *name, float score) {
    Student *s = malloc(sizeof(Student));
    if (!s) return NULL;
    s->id = id;
    snprintf(s->name, sizeof(s->name), "%s", name);
    s->score = score;
    return s;
}

int compare_students(const Student *a, const Student *b) {
    return a->id - b->id;
}
