% compute statistics
function [m, s] = stats(x)
    % mean and std
    n = numel(x);
    m = sum(x) / n;
    s = sqrt(sum((x - m) .^ 2) / (n - 1));
end

data = [1.5, 2, 3e2; 4, 5, 6];
for i = 1:size(data, 1)
    [m, s] = stats(data(i, :));
    fprintf('row %d: mean=%.2f std=%.2f\n', i, m, s);
end
if any(data(:) > 100) && ~isempty(data)
    disp('large values');
end
name = 'text';
msg = "double quoted";
z = 3 + 4i;
