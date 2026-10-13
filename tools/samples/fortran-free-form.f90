! compute a mean
module stats
  implicit none
contains
  function mean(x) result(m)
    real, intent(in) :: x(:)
    real :: m
    m = sum(x) / size(x)
  end function mean
end module stats

program main
  use stats
  implicit none
  real :: data(4) = [1.5, 2.0, 3.25, 4.0e1]
  integer :: i
  character(len=10) :: name = 'values'
  do i = 1, size(data)
    if (data(i) > 3.0) then
      print *, name, i, data(i)
    end if
  end do
  print '(a, f6.2)', 'mean = ', mean(data)
end program main
