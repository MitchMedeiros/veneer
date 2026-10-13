       IDENTIFICATION DIVISION.
       PROGRAM-ID. HELLO.
      * a small program
       DATA DIVISION.
       WORKING-STORAGE SECTION.
       01 WS-NAME      PIC X(10) VALUE 'WORLD'.
       01 WS-COUNT     PIC 9(3) VALUE 0.
       PROCEDURE DIVISION.
           PERFORM VARYING WS-COUNT FROM 1 BY 1 UNTIL WS-COUNT > 3
               DISPLAY "Hello, " WS-NAME WS-COUNT
           END-PERFORM
           IF WS-COUNT = 4
               MOVE 'DONE' TO WS-NAME
           END-IF
           STOP RUN.
