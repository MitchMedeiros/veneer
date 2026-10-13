Imports System

' a small module
Module Program
    Public Class Person
        Public Property Name As String
        Public Property Age As Integer

        Public Function Greet() As String
            Return "Hello, " & Name
        End Function
    End Class

    Sub Main(args As String())
        Dim p As New Person With {.Name = "Ann", .Age = 30}
        If p.Age > 18 Then
            Console.WriteLine(p.Greet())
        Else
            Console.WriteLine("minor")
        End If
        For i As Integer = 1 To 3
            Console.WriteLine($"i = {i}")
        Next
    End Sub
End Module
